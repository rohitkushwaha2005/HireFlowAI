# HireFlow AI — Project Plan

HireFlow AI is an AI-assisted Applicant Tracking System (ATS). Recruiters publish jobs, receive
applications, and get explainable, human-reviewed candidate rankings. Candidates maintain a profile,
upload resumes and track their applications.

This document is the delivery plan. Architecture lives in [ARCHITECTURE.md](ARCHITECTURE.md), the
rationale for each significant choice lives in [DECISIONS.md](DECISIONS.md), and live progress is
tracked in [TODO.md](TODO.md).

## Goals

1. A coherent, deployable product — not a set of disconnected screens.
2. AI that is **grounded** (never invents candidate facts), **explainable** (every score decomposes
   into components derived from data) and **replaceable** (provider behind an interface).
3. Recruitment fairness: scoring uses job-relevant signals only; AI output is decision support and
   never auto-rejects anyone.
4. Production hygiene: validation at every boundary, RBAC enforced on the server, structured logs,
   background processing for expensive work, tests, CI, Docker.

## Non-goals (v1)

- Multi-region deployment, SSO/SAML, billing/subscriptions.
- Parsing non-PDF resumes (DOCX is a documented follow-up).
- Calendar provider integrations (interviews store a meeting URL instead).

## Personas

| Persona | Needs |
| --- | --- |
| Recruiter / org admin | Create jobs, review AI-analyzed requirements, triage applicants, move candidates through the pipeline, schedule interviews, ask the copilot questions, view analytics, manage team. |
| Hiring manager | Read-only access to jobs and candidates of their org plus interview feedback. |
| Candidate | Build a profile, upload resumes, apply to jobs, track status, see interview details. |
| Anonymous visitor | Browse the public job board. |

## Phases

| # | Phase | Exit criteria |
| --- | --- | --- |
| 0 | Planning | Plan, architecture, decisions, TODO, `.env.example` committed. |
| 1 | Project setup | pnpm monorepo, web + api + packages build, lint and typecheck pass, Docker services start. |
| 2 | Database | Prisma schema incl. pgvector columns + HNSW indexes, migration applies, seed runs. |
| 3 | Authentication | Register/login/logout/refresh rotation/verify/reset, RBAC middleware, tests. |
| 4 | Organizations | Create org, membership roles, permission matrix, team management. |
| 5 | Jobs | CRUD, lifecycle (draft → published → paused → closed), duplicate, public board, search/filter. |
| 6 | Resume processing | Upload → validate → store (S3/MinIO) → queue → PDF text → AI extraction → normalize → persist. |
| 7 | AI job analysis | Structured requirement extraction, recruiter edits before publishing. |
| 8 | Matching | Deterministic weighted scoring + semantic component + explanation, unit-tested. |
| 9 | Vector search | Embeddings for candidates/resumes/jobs, hybrid semantic search with filters. |
| 10 | Applications | Apply flow, recruiter management, Kanban with optimistic updates, audit log. |
| 11 | Interviews | Scheduling, status, candidate-specific AI questions. |
| 12 | Copilot | Tool-using, retrieval-grounded chat with stored conversations. |
| 13 | Analytics | SQL aggregations, dashboard charts, funnel. |
| 14 | Candidate portal | Dashboard, jobs, applications, profile, resume, interviews, settings. |
| 15 | Notifications | Email abstraction, templates, queue-backed delivery. |
| 16 | Security review | Checklist in SECURITY.md verified against the code. |
| 17 | Testing | Unit + integration (real Postgres) + Playwright E2E of the demo flow. |
| 18 | Docker + CI | Production images, compose stack, GitHub Actions pipeline. |
| 19 | UI polish | Every screen: loading/empty/error states, responsive, accessible. |
| 20 | Final QA | Scripted walkthrough of the complete demo flow, issues fixed. |

## Demo flow (acceptance test)

The final build must support, without manual DB edits:

1. Recruiter logs in → dashboard → creates "Full Stack Developer" → AI analyzes → recruiter edits
   requirements → publishes.
2. Visitor opens `/jobs` → job page → registers as candidate → uploads resume → applies.
3. Worker parses the resume, extracts the profile, embeds it, computes the match.
4. Recruiter opens applications → candidate → sees score, matched/missing skills, "Why this match?",
   resume → shortlists → generates interview questions → schedules interview.
5. Copilot answers "Which candidates have strong React and Node.js experience?" from real data.
6. Analytics show funnel, trends and candidate statistics.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| No LLM API key in a given environment | Provider abstraction + explicit heuristic development provider, surfaced in the UI as "heuristic mode". Embeddings run locally so vector search is always real. |
| LLM returns malformed JSON | Structured outputs + Zod validation; failures mark the entity FAILED with a retry path. |
| Hallucinated candidate facts in the copilot | Copilot can only obtain candidate data through server-side tools; responses cite candidate IDs which the server verifies exist in the retrieved set. |
| Bias in scoring | Scoring inputs are restricted to skills, experience, education level and semantic similarity of job-relevant text. Name, email, phone, location, photo are never passed to the scorer or embedding text. |
| Resume upload spikes | BullMQ queue with concurrency limits and retries; API returns 202 immediately. |
