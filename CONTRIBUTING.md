# Contributing

## Setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev
```

## Workflow

1. Branch from `main` (`feat/…`, `fix/…`, `docs/…`).
2. Keep changes focused; update docs and `TODO.md` when behaviour changes.
3. Before pushing, run the same gates as CI:

   ```bash
   pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
   pnpm test:integration      # needs TEST_DATABASE_URL (created by docker compose)
   pnpm test:e2e              # needs a running, seeded stack
   ```

4. Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.

## Conventions

**Structure**

- Validation schemas and response DTOs live in `@hireflow/shared` and are used by both API and web.
- API: routes (access + middleware) → controllers (HTTP adaptation via `handle()`) → services
  (business rules, transactions, audit) → repositories/Prisma. Services never import Express.
- Never read `process.env` outside `apps/api/src/config/env.ts`.
- Throw `AppError` subclasses for expected failures; let the central handler format responses.
- Web: server state via TanStack Query hooks in `src/features/api`; forms with React Hook Form +
  shared Zod schemas; UI primitives from `src/components/ui`.

**Code**

- TypeScript strict; no `any`, `@ts-ignore` or `@ts-expect-error`.
- Keep components and functions small; comment the _why_, not the _what_.
- Every org-scoped query must filter by `organizationId`; add an integration test for new
  authorization rules.
- AI output is untrusted: validate with Zod and sanitize before persisting.
- Nothing personal (names, contact details, location, institutions) may enter scoring or embedding
  inputs.

**Database**

- Change `schema.prisma`, then `pnpm db:migration:new <name>`; review the SQL; `pnpm db:migrate`.
- Keep migrations backwards compatible (expand → migrate → contract).

**Tests**

- Pure logic → unit tests next to the code (`*.test.ts`).
- API behaviour, auth and tenancy → `apps/api/test/integration`.
- User journeys → Playwright in `apps/web/e2e`.
