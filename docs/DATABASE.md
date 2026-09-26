# Database

PostgreSQL 16 with the `vector` extension (pgvector), managed with Prisma 6.
Schema: [packages/database/prisma/schema.prisma](../packages/database/prisma/schema.prisma).

## Why PostgreSQL (and not MongoDB)

ATS data is relational: organizations own jobs, jobs have requirements and applications,
applications link candidates, resumes, matches, interviews, notes and status history, and every
recruiter action is audited. We need foreign keys, unique constraints (one application per
candidate per job), transactions (status change + history + audit commit together) and SQL
aggregation for analytics. pgvector adds similarity search **in the same database**, so hybrid
queries (vector distance + tenant scoping + structured filters) are a single statement, consistent
with the rest of the data.

## Entity overview

```text
User ─┬─ OrganizationMember ── Organization ─┬─ Job ── JobRequirement
      │                                       ├─ AuditLog
      │                                       └─ CopilotConversation ── CopilotMessage
      ├─ CandidateProfile ─┬─ Resume
      │                    ├─ CandidateSkill / Education / WorkExperience / CandidateProject
      │                    └─ Application ─┬─ CandidateMatch (1:1)
      │                                    ├─ ApplicationStatusEvent (history)
      │                                    ├─ ApplicationNote
      │                                    ├─ Interview
      │                                    └─ InterviewQuestion
      ├─ RefreshToken (hashed, rotating, family)
      └─ VerificationToken (hashed, single-use: email verification / password reset / invitation)
```

| Model                                                                  | Notes                                                                                                                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`                                                                 | Global role `ADMIN · RECRUITER · HIRING_MANAGER · CANDIDATE`; `passwordHash` nullable for Google-only accounts                                                   |
| `OrganizationMember`                                                   | Org role `OWNER · ADMIN · RECRUITER · HIRING_MANAGER` → permission set (`@hireflow/shared/permissions`)                                                          |
| `Organization`                                                         | `matchingWeights` JSON (validated by Zod)                                                                                                                        |
| `Job`                                                                  | Lifecycle `DRAFT → PUBLISHED ⇄ PAUSED → CLOSED`; AI analysis fields; `embedding`, `requirementsEmbedding`                                                        |
| `JobRequirement`                                                       | `skill`, `normalizedSkill` (taxonomy key), `category`, `required`, `weight 1–5`, `minimumYears`, `aiGenerated`                                                   |
| `CandidateProfile`                                                     | Profile fields, `totalExperience` (merged ranges), `highestEducation`, `certifications`, `embedding`                                                             |
| `Resume`                                                               | Object-storage key (never a public URL), checksum, `parsingStatus PENDING/PROCESSING/COMPLETED/FAILED`, `parsingError`, attempts, `parsedData` JSON, `embedding` |
| `CandidateSkill` · `Education` · `WorkExperience` · `CandidateProject` | `source RESUME/MANUAL/INFERRED` so re-parsing never overwrites manual edits                                                                                      |
| `Application`                                                          | Unique `(jobId, candidateId)`; statuses `APPLIED … HIRED, REJECTED, WITHDRAWN`                                                                                   |
| `CandidateMatch`                                                       | Component scores, matched/missing skills, explanation, highlights, concerns, per-requirement `details`, applied `weights`                                        |
| `AuditLog`                                                             | `action` enum (JOB_CREATED … RESUME_VIEWED), entity, metadata, IP                                                                                                |

## Indexes

Every foreign key used in filters is indexed, plus sort/filter combinations used by list screens:
`jobs(organizationId, status)`, `jobs(status, publishedAt)`, `applications(jobId, status)`,
`applications(status, appliedAt)`, `candidate_skills(normalizedSkill)`,
`application_status_events(applicationId, createdAt)`, `audit_logs(organizationId, createdAt)`,
`interviews(interviewerId, scheduledAt)`, `candidate_matches(overallScore)` and more.

### Vector indexes

```sql
CREATE INDEX candidate_profiles_embedding_hnsw ON candidate_profiles USING hnsw (embedding vector_cosine_ops);
CREATE INDEX resumes_embedding_hnsw            ON resumes            USING hnsw (embedding vector_cosine_ops);
CREATE INDEX jobs_embedding_hnsw               ON jobs               USING hnsw (embedding vector_cosine_ops);
CREATE INDEX jobs_requirements_embedding_hnsw  ON jobs               USING hnsw ("requirementsEmbedding" vector_cosine_ops);
```

Vectors are 384-dimensional and L2-normalized, so `<=>` (cosine distance) ranks by cosine
similarity. HNSW gives sub-linear approximate search that stays fast as the talent pool grows.

## Vector access

Prisma models vector columns as `Unsupported("vector(384)")`, so all vector reads/writes live in
[`VectorRepository`](../apps/api/src/repositories/vector.repository.ts) using tagged-template raw
SQL (fully parameterized):

- **Candidate search**: stage 1 retrieves the nearest 200 profiles through the HNSW index _inside_ the
  tenant/skill/experience filters; stage 2 re-ranks them by `max(profile similarity, resume similarity)`.
- **Candidate ↔ job similarity** for matching: best of profile↔description, profile↔requirements and
  resume↔description.
- **Job recommendations** for candidates: published jobs nearest to the candidate profile.

## Migrations

```bash
pnpm db:migrate                 # apply pending migrations (prisma migrate deploy)
pnpm db:migration:new add_x     # create a migration from schema changes
pnpm db:studio                  # Prisma Studio
```

Prisma cannot represent indexes on `Unsupported` columns, so every generated diff proposes dropping
the HNSW indexes. `db:migration:new` wraps `prisma migrate dev --create-only` and strips those
statements (and deletes the migration if nothing else remains). `db:migrate` uses `migrate deploy`,
which never prompts or resets.

## Seed

`pnpm db:seed` (runner: [apps/api/src/scripts/seed.ts](../apps/api/src/scripts/seed.ts), fixtures:
[packages/database/src/seed/fixtures.ts](../packages/database/src/seed/fixtures.ts)) builds the
TechNova Labs demo through the real services: resumes are rendered to PDF, uploaded to storage,
parsed by the configured AI provider, embedded and matched. It is idempotent and only touches the
demo organization and `@demo.hireflow.local` users. All people, companies and schools are fictional.

## Tenancy and data access rules

- Every staff query filters by the caller's `organizationId` (derived from membership, never from
  client input). Cross-tenant ids return 404.
- Candidates are visible to an organization only if they applied to one of its jobs; resumes only if
  they were submitted to it.
- Candidates see their own data only; recruiter notes, match scores and audit data are never
  included in candidate-facing DTOs.
