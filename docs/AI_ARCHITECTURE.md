# AI Architecture

HireFlow uses AI where it is strong (reading unstructured text, writing questions, conversational
answers) and deterministic code where decisions must be reproducible and auditable (scoring).

```text
AIService (facade: provider choice + output sanitation)
├── ResumeParser        resume text  → ResumeAnalysis        (LLM structured output → Zod)
├── JobAnalyzer         description  → JobAnalysis           (LLM structured output → Zod)
├── InterviewGenerator  job+candidate → questions             (LLM structured output → Zod)
├── HiringCopilot       question     → grounded answer        (LLM tool-use loop over server tools)
├── EmbeddingService    text         → vector(384)            (local bge-small-en-v1.5, ONNX)
└── CandidateMatcher    job+candidate+similarity → score      (deterministic, @hireflow/shared)
```

## Providers

`AIProvider` ([types.ts](../apps/api/src/ai/types.ts)) is the only contract business logic sees:
`parseResume`, `analyzeJob`, `generateInterviewQuestions`, `answerHiringQuestion`.

### Claude (`AnthropicProvider`)

- Official `@anthropic-ai/sdk`; model from `AI_MODEL` (default `claude-opus-5`), adaptive thinking.
- **Structured outputs**: `output_config.format` is generated from the same Zod schema
  (`betaZodOutputFormat`). The provider checks `stop_reason` _before_ parsing (refusal and
  truncation are errors, not malformed JSON), parses, then **re-validates with Zod**. Extraction runs at
  `effort: low`, question generation at `medium`.
- **Refusal fallback**: on Opus 5 / Fable 5 models the request enables the server-side fallback
  (`fallbacks: "default"`), so a policy decline is retried on a fallback model inside the same call.
- **Errors** are mapped to `AIUnavailableError` (503) — retryable in the worker, readable in the UI.
- Tested offline by driving the real SDK through a stubbed `fetch`
  ([anthropic-provider.test.ts](../apps/api/src/ai/anthropic-provider.test.ts)).

### Heuristic (`HeuristicProvider`) — development fallback

Selected automatically when `AI_API_KEY` is empty (`AI_PROVIDER=auto`). Fully offline and
deterministic:

- Resume parser: section detection, date-range parsing, title/company splitting, degree-level
  mapping, contact/link extraction, skill years derived from dated roles that mention the skill.
- Job analyzer: requirements vs. nice-to-have sections, per-skill years, overall years, education,
  seniority, workplace and employment type.
- Interview generator: category templates filled with the candidate's real projects, roles and gaps.
- Copilot: regex intent routing to the same server tools, answers templated from returned rows.

It is labelled **Heuristic AI** in API responses (`aiProvider`) and in the UI. It works well on
conventional resume layouts but is not equivalent to an LLM.

## Resume pipeline

```text
upload (API, 202) → validate type/size/PDF signature → store in S3 → Resume{PENDING} → enqueue
worker: PROCESSING → extract text (unpdf) → AI parse → sanitize → persist profile (transaction)
      → COMPLETED → embed profile + resume → re-match the candidate's applications
failure: bad input → FAILED + reason (candidate can retry)   outage → retry with backoff (4 attempts)
```

Persisting replaces only `source=RESUME` rows and fills empty profile fields, so a candidate's manual
edits survive re-parsing. Sanitation caps lengths, de-duplicates skills, bounds numbers and keeps
only `http(s)` links (a crafted PDF cannot plant `javascript:` URLs).

## Embeddings

- `Xenova/bge-small-en-v1.5` (384-d) via Transformers.js/ONNX in the API/worker process — no API
  key, no per-call cost, identical in every environment. Model weights are cached (~35 MB).
- Asymmetric retrieval: queries get bge's instruction prefix; documents do not.
- Long texts are chunked on paragraph/sentence boundaries (~350 tokens) and mean-pooled.
- **What gets embedded** is decided by one builder per entity
  ([scoring-text.ts](../packages/shared/src/matching/scoring-text.ts)): headline, summary, skills,
  roles with descriptions, projects, degree + field, certifications. **Excluded**: names, contact
  details, location, links, institutions, dates of birth and any personal attribute.

## Matching (explainable scoring)

Implemented as a pure function in [scoring.ts](../packages/shared/src/matching/scoring.ts) with
21 unit tests. Every component is 0–100; non-evaluable components are excluded and the remaining
weights re-normalized.

| Component  | Default weight | Computation                                                                                                                                                                                                                            |
| ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills     | 0.40           | For each requirement: exact skill = 1.0 credit; fewer years than requested = `max(0.5, years/min)`; related skill (taxonomy) = 0.5; missing = 0. Importance = weight (1–5) × 2 if required. Score = Σ importance·credit / Σ importance |
| Experience | 0.20           | `min(1, years / minYears)`. Meeting or exceeding the minimum is 100 — **over-qualification is never penalized** (it would proxy for age). Unknown → neutral 50                                                                         |
| Education  | 0.10           | Meets level → 100; one level below → 60; further → 30; unknown → 40; no requirement → excluded                                                                                                                                         |
| Semantic   | 0.30           | Cosine similarity rescaled from the calibrated band [0.60, 0.90] to [0, 100]                                                                                                                                                           |

`overall = Σ wᵢ·componentᵢ` over applicable components (weights configurable per organization in
Settings; saving re-scores every application in the background).

The **explanation, highlights and concerns are generated from the computed data** (required skills
met, missing skills, related-experience substitutions, years vs. requirement, education, semantic
band). The LLM never produces or adjusts a score, so scores are reproducible and auditable.

**Calibration**: the semantic band was set from the seed data, where unrelated role pairs score
0.60–0.65 cosine, adjacent roles 0.70–0.80 and strong fits 0.85–0.92. After changing the model or
band, run `pnpm --filter @hireflow/api backfill`.

## Hiring Copilot

```text
question → Claude (tools) ⇄ server tools (tenant-scoped SQL + vector search) → answer
                                             │
                          retrieved candidates recorded ──▶ references verified against answer
```

Tools ([toolbox.ts](../apps/api/src/ai/copilot/toolbox.ts)): `search_candidates` (semantic),
`find_candidates_by_skills`, `find_candidates_missing_skill`, `get_candidate_profile`,
`compare_candidates`, `list_applications`, `list_jobs`, `get_pipeline_summary`,
`get_interview_questions`.

How hallucination is prevented:

1. The model has no database access except these tools; each is scoped to the caller's
   organization and returns only job-relevant fields.
2. Tool inputs are validated with Zod; invalid calls return an error result instead of executing.
3. The system prompt forbids stating facts not retrieved in the conversation and requires exact
   names and scores.
4. The response's candidate chips are computed server-side: only candidates **returned by a tool in
   this turn and named in the answer** become references.
5. Candidate-written text inside tool results is marked as data, never instructions.
6. The loop is bounded (8 iterations); conversations are stored for history.

## Fairness and responsible use

- Protected characteristics are never inputs: the scorer's input types have no field for them, and
  the embedding text builders exclude personal attributes and institution names.
- Prompts instruct models not to infer or use protected characteristics, not to judge employment
  gaps or graduation years, and to omit discriminatory requirements from job analysis.
- Resume parsing does not extract date of birth, gender, nationality, marital status or photos.
- AI never changes an application's status; rejections require a confirmation that reminds the
  recruiter a score alone is not a reason to reject; a human-review disclaimer appears wherever
  scores appear.
- Every AI-produced artifact records its provider (`aiProvider`) for traceability.

## Evaluation (next steps)

- Labelled resume set to measure field-level parsing accuracy per provider.
- Ranking quality checks for semantic search (the integration suite already asserts that a real-time
  WebSocket engineer ranks first for a real-time query).
- Monitoring of score distributions by job and adverse-impact analysis on outcomes.
