# TODO

Legend: `[x]` done and verified · `[~]` in progress · `[ ]` not started

## Phase 0 — Planning

- [x] PROJECT_PLAN.md, ARCHITECTURE.md, DECISIONS.md, TODO.md
- [x] .env.example
- [x] Git initialized

## Phase 1 — Project setup

- [ ] pnpm workspace, root scripts, tsconfig/eslint/prettier presets
- [ ] packages/shared, packages/database skeletons
- [ ] apps/api (Express 5, config, logger, error handling, health)
- [ ] apps/web (Vite, React, Tailwind v4, router, query client)
- [ ] docker-compose (postgres+pgvector, redis, minio, mailpit)
- [ ] lint + typecheck + build green

## Phase 2 — Database

- [ ] Prisma schema (all entities, enums, indexes)
- [ ] pgvector columns + HNSW indexes in migration
- [ ] Seed system

## Phase 3 — Authentication

- [ ] Register / login / logout / refresh rotation
- [ ] Email verification, forgot/reset password
- [ ] Google OAuth (when configured)
- [ ] RBAC middleware + tests

## Phase 4 — Organizations

- [ ] Create org, members, roles, permission matrix, team management

## Phase 5 — Jobs

- [ ] CRUD + lifecycle + duplicate + public board + search/filter

## Phase 6 — Resume processing

- [ ] Upload/validate/store, PDF extraction, queue, AI parse, persist, retry

## Phase 7 — AI job analysis

- [ ] Analyzer, editable requirements

## Phase 8 — Matching

- [ ] Scoring function + tests, explanation, configurable weights

## Phase 9 — Vector search

- [ ] Embedding service, hybrid semantic search

## Phase 10 — Applications

- [ ] Apply flow, Kanban, optimistic updates, audit log

## Phase 11 — Interviews

- [ ] Scheduling, status, AI questions

## Phase 12 — Copilot

- [ ] Tool-using agent, heuristic intent router, history, UI

## Phase 13 — Analytics

- [ ] SQL aggregates, charts, funnel

## Phase 14 — Candidate portal

- [ ] All candidate pages

## Phase 15 — Notifications

- [ ] Email provider + templates + queue

## Phase 16 — Security review

## Phase 17 — Testing

## Phase 18 — Docker + CI

## Phase 19 — UI polish

## Phase 20 — Final QA
