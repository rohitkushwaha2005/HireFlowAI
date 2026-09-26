# HireFlow AI — Architecture

## System overview

```text
                ┌──────────────────────────┐
  Browser ─────▶│  apps/web (React + Vite) │  SPA: public job board, recruiter app, candidate portal
                └────────────┬─────────────┘
                             │ REST (JSON, /api/*)  access token in memory, refresh token in httpOnly cookie
                ┌────────────▼─────────────┐
                │  apps/api  (Express)     │  routes → controllers → services → repositories (Prisma)
                │  - auth / RBAC           │
                │  - validation (Zod)      │──────────┐ enqueue
                │  - OpenAPI docs          │          ▼
                └───┬───────────┬──────────┘   ┌──────────────┐
                    │           │              │ Redis/BullMQ │
                    │           │              └──────┬───────┘
                    │           │                     │ consume
                    │           │              ┌──────▼──────────────────┐
                    │           │              │ apps/api worker process │ resume parsing, embeddings,
                    │           │              │ (same codebase)         │ matching, email, analytics
                    │           │              └──┬──────────┬───────────┘
          ┌─────────▼──┐   ┌────▼──────────┐      │          │
          │ PostgreSQL │◀──┤ S3 / MinIO    │◀─────┘          ▼
          │ + pgvector │   │ (resumes)     │           AI providers (Claude / heuristic dev),
          └────────────┘   └───────────────┘           local embedding model
```

The API and the worker are two entry points (`src/server.ts`, `src/worker.ts`) of one package, so
they share services, repositories and the AI layer. They are deployed as separate processes so the
API never blocks on AI work and the worker can be scaled independently.

## Monorepo layout

```text
apps/
  web/        React SPA (Vite, Tailwind v4, shadcn/ui-style components, TanStack Query, RHF + Zod)
  api/        Express API + BullMQ worker
packages/
  database/   Prisma schema, migrations, generated client, seed
  shared/     Zod schemas + inferred types shared by web and api, enums, skill taxonomy,
              pure matching/scoring functions, API response envelope types
  config/     Shared tsconfig / eslint presets
docker/       Dockerfiles, nginx config
docs/         API.md, DATABASE.md, AI_ARCHITECTURE.md, DEPLOYMENT.md, SECURITY.md
scripts/      Dev helpers (sample resume generation, etc.)
```

## Backend layering

```text
routes/        Express routers: path + middleware composition only
controllers/   HTTP adaptation: parse validated input, call service, shape response envelope
services/      Business rules, authorization decisions that depend on data, orchestration, audit
repositories/  Prisma queries (and raw SQL for pgvector); no business rules
validators/    Zod request schemas (mostly re-exported from @hireflow/shared)
middleware/    auth, RBAC, org context, validation, rate limit, request id/logging, errors, upload
ai/            AIService facade, providers (anthropic, heuristic), embeddings, prompts
jobs/          Queue definitions, dispatcher abstraction, processors
lib/           storage, email, pdf, crypto, logger, cache
config/        Env parsing (Zod) — the only place `process.env` is read
```

Errors are thrown as `AppError` subclasses (`NotFoundError`, `ForbiddenError`, ...) and converted by
a single error middleware into the error envelope:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": {} } }
```

Successful responses use `{ "success": true, "data": …, "message"?: …, "meta"?: { pagination } }`.

## Authentication and authorization

- **Access token**: short-lived JWT (15 min) returned in the response body, kept in memory by the SPA,
  sent as `Authorization: Bearer`.
- **Refresh token**: opaque random token in an `httpOnly`, `SameSite=Lax`, path-scoped cookie. Stored
  hashed (SHA-256) in `RefreshToken` with a `familyId`. Every refresh rotates the token; reuse of a
  revoked token revokes the whole family (theft detection).
- **Email verification / password reset**: single-use hashed tokens with expiry in `VerificationToken`.
- **Google OAuth**: authorization-code flow implemented server-side when `GOOGLE_CLIENT_ID` is set.
- **RBAC**, two levels:
  1. Global `User.role` (`ADMIN`, `RECRUITER`, `HIRING_MANAGER`, `CANDIDATE`) gates route families
     (e.g. candidate portal vs recruiter app).
  2. `OrganizationMember.role` (`OWNER`, `ADMIN`, `RECRUITER`, `HIRING_MANAGER`) maps to a
     permission set (`jobs:write`, `applications:move`, `team:manage`, …) defined once in
     `@hireflow/shared` and checked by `requirePermission()` middleware. Every org-scoped query is
     filtered by the caller's `organizationId`, so cross-tenant access is impossible even with a
     guessed ID.
- The SPA uses the same permission map to hide actions, but the server is the source of truth.

## Data model (summary)

See [docs/DATABASE.md](docs/DATABASE.md) for the full schema. Core aggregates:

- `User` ─1:1─ `CandidateProfile` ─1:N─ `Resume`, `CandidateSkill`, `Education`, `WorkExperience`, `CandidateProject`
- `Organization` ─1:N─ `OrganizationMember`, `Job` ─1:N─ `JobRequirement`
- `Application` (job × candidate, unique) ─1:1─ `CandidateMatch`, ─1:N─ `Interview`, `InterviewQuestion`
- `AuditLog`, `RefreshToken`, `VerificationToken`, `CopilotConversation` ─1:N─ `CopilotMessage`
- Embedding columns (`vector(384)`) on `CandidateProfile`, `Resume`, `Job` (description) and
  `Job.requirementsEmbedding`, with HNSW cosine indexes.

## AI architecture

```text
AIService (facade used by services/processors)
├── ResumeParser        text → ResumeAnalysis (Zod-validated)
├── JobAnalyzer         description → JobAnalysis (requirements, seniority, …)
├── CandidateMatcher    deterministic weighted scoring + semantic similarity (no LLM score)
├── InterviewGenerator  resume + job → categorized questions with expected signals
├── HiringCopilot       tool-using agent over server-side retrieval tools
└── EmbeddingService    text → number[384] (local model), chunking + mean pooling
```

`AIProvider` is an interface with two implementations:

- `AnthropicProvider` — Claude via the official SDK, structured outputs validated with Zod, tool use
  for the copilot.
- `HeuristicProvider` — deterministic development fallback (section parsing + skill taxonomy). It is
  labelled as such in API responses and the UI and is **not** equivalent to production AI.

Embeddings are a separate `EmbeddingProvider` interface; the default runs `bge-small-en-v1.5` locally
via ONNX so semantic search is real in every environment.

Details and prompts: [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md).

## Matching

```text
overall = Σ weight_i × component_i        (weights configurable per organization, normalized to 1)
skills      required/preferred requirement coverage, weighted by requirement weight, with years check
experience  candidate relevant years vs job minimum (smooth curve, capped)
education   candidate highest level vs required level (ordinal)
semantic    cosine(candidate profile embedding, job embedding) rescaled to 0–100
```

All components are 0–100. The explanation is generated from the same numbers (matched/missing
skills, experience gap, similarity band) — not by an LLM. Inputs never include name, contact details,
location, photo or other personal attributes.

## Background processing

| Queue               | Producer                                                         | Work                                                                                  |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `resume-processing` | resume upload, retry                                             | download file → extract PDF text → AI parse → normalize → persist → enqueue embedding |
| `embeddings`        | resume parsed, job saved, profile edited                         | compute + store vectors → enqueue matching for affected applications                  |
| `matching`          | application created, embeddings updated, job requirements edited | compute `CandidateMatch`                                                              |
| `email`             | domain events                                                    | render template → send through `EmailProvider`                                        |
| `analytics`         | scheduled                                                        | refresh cached dashboard aggregates in Redis                                          |

A `JobDispatcher` interface hides BullMQ; tests use an inline dispatcher so flows are deterministic.

## Frontend architecture

- Routes: public (`/`, `/jobs`, `/jobs/:slug`, auth pages), recruiter app (`/app/*`), candidate
  portal (`/portal/*`). Route guards read the same role/permission map as the API.
- Server state in TanStack Query (query keys per resource, optimistic Kanban updates with rollback).
- Forms with React Hook Form + the shared Zod schemas, so client and server validate identically.
- Design system in `src/components/ui` (shadcn/ui pattern on Radix primitives) + composed components
  (`SearchInput`, `FilterPanel`, `EmptyState`, `ErrorState`, `Pagination`, …).
- Feature folders (`features/jobs`, `features/applications`, …) own their API hooks and components.

## Observability

- `pino` structured logs; `pino-http` adds request id (`X-Request-Id` in/out), method, path,
  status, duration. Redaction list covers authorization headers, cookies, passwords, tokens, keys.
- Worker logs job id, queue, attempt, duration and failure reason.
- `/api/health` (liveness) and `/api/health/ready` (DB + Redis) endpoints.

## Deployment

Docker images for `api` (also used for `worker`) and `web` (static build served by nginx, which also
proxies `/api`). Compose runs Postgres (pgvector), Redis, MinIO, Mailpit, api, worker, web. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
