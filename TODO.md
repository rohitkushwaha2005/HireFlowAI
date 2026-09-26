# TODO

Legend: `[x]` done and verified · `[~]` implemented, not verifiable in this environment · `[ ]` backlog

## Phases

- [x] **0 Planning** — plan, architecture, decisions, TODO, `.env.example`, git
- [x] **1 Project setup** — pnpm monorepo, TS strict presets, ESLint 9 + Prettier, Vite/React, Express 5, Docker Compose
- [x] **2 Database** — Prisma schema (21 models), pgvector columns + HNSW indexes, migration helper, seed system
- [x] **3 Authentication** — register/login/logout, rotating refresh tokens with reuse detection, email verification, forgot/reset, RBAC, tests
- [~] **3 Google OAuth** — authorization-code flow implemented; needs `GOOGLE_CLIENT_ID/SECRET` to exercise
- [x] **4 Organizations** — org on recruiter sign-up, onboarding, members, invitations, roles, permission matrix, org switcher
- [x] **5 Jobs** — CRUD, lifecycle, duplicate, delete guard, public board with search/filters
- [x] **6 Resume processing** — upload validation, S3 storage, queue, PDF extraction, AI parse, persist, retry, status polling
- [x] **7 AI job analysis** — structured requirements, recruiter review/edit before publishing
- [x] **8 Matching** — weighted deterministic scoring, explanation, configurable weights, 21 unit tests
- [x] **9 Vector search** — local embeddings, HNSW, hybrid search with re-ranking, search reasons, job recommendations
- [x] **10 Applications** — apply/withdraw, recruiter list, Kanban with optimistic updates + rollback + concurrency, notes, history, audit
- [x] **11 Interviews** — scheduling, status, feedback/rating, reminders, candidate-specific AI questions
- [x] **12 Copilot** — tool-using agent (Claude) and heuristic router over tenant-scoped tools, verified references, history, UI
- [x] **13 Analytics** — SQL aggregates, funnel by furthest stage, charts with table views, Redis cache
- [x] **14 Candidate portal** — dashboard, jobs, apply, applications, profile editor, resume manager, interviews, settings
- [x] **15 Notifications** — provider abstraction (SMTP verified with Mailpit, console), templates, queued delivery, debounced status emails
- [~] **15 Resend provider** — implemented; needs `EMAIL_API_KEY`
- [x] **16 Security review** — see [SECURITY.md](SECURITY.md) review log (5 findings fixed)
- [x] **17 Testing** — shared 47, API unit 37, API integration 27, web 8, Playwright E2E (dev stack and Docker stack)
- [x] **18 Docker + CI** — production images verified end to end with E2E; GitHub Actions workflow
- [~] **18 CI run** — workflow written and each step run locally; not yet executed on GitHub (no remote configured)
- [x] **19 UI polish** — reviewed via screenshots; responsive, loading/empty/error states, a11y fixes
- [x] **20 Final QA** — full demo flow verified (see below)

## Verification status of external integrations

| Integration                  | Status                                                                                                                                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic Claude             | `[~]` Implemented with the official SDK; request construction, structured-output parsing, refusal/truncation handling, error mapping and the tool loop are tested through the real SDK with a stubbed transport. A live run needs `AI_API_KEY`. |
| Local embeddings (bge-small) | `[x]` Live in dev, tests, Docker                                                                                                                                                                                                                |
| S3 storage                   | `[x]` SeaweedFS (S3 API) in dev and Docker; AWS S3 uses the same client                                                                                                                                                                         |
| SMTP email                   | `[x]` Mailpit                                                                                                                                                                                                                                   |

## Backlog

- [ ] Run the CI workflow on GitHub and add a status badge
- [ ] Live evaluation of Claude parsing against a labelled resume set
- [ ] DOCX resumes; OCR for scanned PDFs
- [ ] Malware scanning for uploads
- [ ] Calendar integrations and candidate self-scheduling
- [ ] Per-job pipeline stages and structured scorecards
- [ ] Hosted embedding provider option with dimension migration
- [ ] Bias monitoring (score distributions, adverse-impact analysis on outcomes)
- [ ] Candidate data export/deletion (GDPR-style requests) and retention policies
- [ ] SSO (SAML/OIDC)
