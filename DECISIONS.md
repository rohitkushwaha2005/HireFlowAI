# Architecture Decision Records

Short ADRs. Each: context → decision → consequences.

## ADR-001 pnpm workspaces monorepo

Web and API share validation schemas, enums, the permission matrix and the scoring function.
**Decision:** pnpm workspaces with `apps/*` and `packages/*`; internal packages are consumed as
TypeScript source through `exports` during development and built with `tsc` for production.
**Consequences:** one lockfile, one CI pipeline, no drift between client and server validation.

## ADR-002 `packages/shared` holds both schemas and types

The brief suggests separate `shared` and `types` packages. Our types are inferred from Zod schemas
(`z.infer`), so splitting them would force duplicate declarations or a circular dependency.
**Decision:** a single `@hireflow/shared` package exports schemas, inferred types, enums and pure
domain functions. `@hireflow/config` holds tsconfig/eslint presets. Prisma-generated types stay in
`@hireflow/database`.

## ADR-003 Express + layered architecture

Express is ubiquitous, easy to reason about and has mature middleware (helmet, rate limiting).
**Decision:** routes → controllers → services → repositories, with Zod validation middleware and a
central error handler. Express 5 for native async error propagation.

## ADR-004 PostgreSQL + Prisma + pgvector

ATS data is highly relational (orgs, jobs, applications, interviews, audit), needs transactions and
aggregate analytics. pgvector keeps embeddings next to the data, so hybrid queries (vector distance +
SQL filters + tenant scoping) are a single statement and consistent with the rest of the data.
**Decision:** Prisma for schema/migrations/typed CRUD; vector columns declared as
`Unsupported("vector(384)")` and accessed through a small raw-SQL repository. HNSW indexes with
`vector_cosine_ops` are created in the migration SQL.
**Consequences:** vector reads/writes use `$queryRaw`/`$executeRaw` with tagged templates
(parameterized, injection-safe).

## ADR-005 Local embedding model by default

Anthropic does not offer an embeddings endpoint, and requiring a second paid key for semantic search
makes local development fragile. **Decision:** `EmbeddingProvider` interface; default implementation
runs `Xenova/bge-small-en-v1.5` (384 dims, strong retrieval quality for its size) through
`@huggingface/transformers` (ONNX runtime) inside the API/worker. Long texts are chunked and
mean-pooled, vectors are L2-normalized. The dimension is a single constant shared with the migration.
**Consequences:** first run downloads ~35 MB of model weights (cached). Switching to a hosted
embedding model with a different dimension requires a migration and re-embedding (documented).

## ADR-006 LLM provider: Claude behind an `AIProvider` interface

**Decision:** `AnthropicProvider` using the official `@anthropic-ai/sdk`, model configurable via
`AI_MODEL` (default `claude-opus-5`), structured outputs (`messages.parse` + Zod) for extraction
tasks, tool use for the copilot. All model output is re-validated with Zod before it touches the DB.

## ADR-007 Heuristic development provider

The brief requires a clearly separated fallback when no key is available. **Decision:**
`HeuristicProvider` implements the same interface with deterministic parsing (section detection,
regexes, skill taxonomy) and templated copilot answers built only from retrieved rows. Responses
carry `provider: "heuristic"` and the UI shows a "Heuristic AI mode" badge. It is never selected
silently when `AI_PROVIDER=anthropic` is configured — a missing key is then a startup error.

## ADR-008 Matching is deterministic; the LLM never produces the score

LLM scores are non-reproducible and hard to audit — unacceptable for hiring decisions. **Decision:**
weighted components (skills 0.40, experience 0.20, education 0.10, semantic 0.30 by default,
configurable per organization), each normalized to 0–100, implemented as a pure function in
`@hireflow/shared` with unit tests. The explanation is templated from the computed data.

## ADR-009 Fairness guardrails

**Decision:** scoring and embedding inputs are built by a single function
(`buildCandidateScoringText`) that includes only skills, titles, experience descriptions, projects,
certifications and education. Names, contact details, location, links, photos, dates of birth are
excluded. Prompts instruct the model not to infer protected characteristics, and resume parsing does
not extract them. No status transition is triggered by a score. A disclaimer is shown wherever
scores appear.

## ADR-010 Token strategy

**Decision:** 15-minute JWT access tokens in memory (not localStorage, limits XSS blast radius) and
rotating opaque refresh tokens in an httpOnly cookie with reuse detection. Passwords hashed with
Argon2id (`@node-rs/argon2`, prebuilt binaries — no node-gyp).

## ADR-011 BullMQ with a dispatcher abstraction

**Decision:** BullMQ queues on Redis; producers depend on `JobDispatcher`. Production uses
`BullMqDispatcher`; tests use `InlineDispatcher` which runs processors synchronously so integration
tests are deterministic. Jobs are idempotent (keyed by entity id) and retried with exponential
backoff.

## ADR-012 Object storage via S3 API; MinIO locally

**Decision:** `StorageProvider` interface with an S3 implementation (`@aws-sdk/client-s3`) that works
with AWS S3 and MinIO, plus a local-filesystem implementation for tests. Resumes are never public;
downloads go through an authorized API endpoint that streams the object (or a short-lived signed URL).

## ADR-013 Email via provider interface

**Decision:** `EmailProvider` with SMTP (nodemailer → Mailpit in development), Resend (HTTP, when
`EMAIL_API_KEY` is set) and a console provider. Templates are typed functions returning subject/text/html.

## ADR-014 Frontend stack

React 19 + Vite + TypeScript strict, Tailwind CSS v4, shadcn/ui-pattern components (source-owned,
built on Radix primitives), TanStack Query, React Hook Form + Zod, Recharts, dnd-kit, Axios with a
refresh-on-401 interceptor. shadcn components are written into `src/components/ui` (as the shadcn CLI
would) so they are fully owned and reviewable.

## ADR-015 Testing strategy

Vitest for unit tests (shared scoring, normalization, permissions, validators) and API integration
tests (supertest against a real Postgres test database, inline dispatcher, heuristic AI provider and
filesystem storage). Playwright for the end-to-end demo journey against the running stack.

## ADR-016 Copilot grounding

**Decision:** the copilot is an agent loop whose only access to data is a fixed set of server-side
tools (`search_candidates`, `get_candidate`, `compare_candidates`, `list_applications`, …) that are
tenant-scoped. The system prompt forbids stating facts not present in tool results. The response
includes the candidate IDs it referenced; the server drops references to IDs that were not returned by
a tool in that turn. Conversations are persisted for history.

## ADR-017 Repository root

The brief shows a `hireflow-ai/` folder; the provided working directory `HireFlowAI/` is used as the
repository root with the same internal structure.
