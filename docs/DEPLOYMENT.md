# Deployment

## Artifacts

| Image          | Dockerfile                                        | Runs                                                                                                       |
| -------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `hireflow-api` | [docker/api.Dockerfile](../docker/api.Dockerfile) | API: `node dist/server.js` · Worker: `node dist/worker.js` · Seed/backfill: `node dist/{seed,backfill}.js` |
| `hireflow-web` | [docker/web.Dockerfile](../docker/web.Dockerfile) | nginx serving the SPA and proxying `/api` to the API                                                       |

The API image is multi-stage: dependencies installed with a frozen lockfile, workspace packages
bundled by tsup, production `node_modules` produced by `pnpm deploy`, Prisma client generated, and
the runtime stage runs as a non-root user. The web image serves hashed assets with immutable
caching and sets security headers.

## Local production-like stack

```bash
docker compose --profile app up -d --build
docker compose exec -e ALLOW_DEMO_SEED=true api node dist/seed.js   # optional
open http://localhost:8080
```

Services: `postgres` (pgvector), `redis`, `s3` (SeaweedFS), `mailpit`, `api` (runs migrations on
start), `worker`, `web`. The compose file ships fixed JWT secrets **for this local stack only**.

## Production checklist

**Secrets & config**

- [ ] `NODE_ENV=production` (placeholder JWT secrets are rejected at startup).
- [ ] `JWT_SECRET`, `JWT_REFRESH_SECRET`: 48+ random bytes each, from a secret manager.
- [ ] `AI_PROVIDER=anthropic` with `AI_API_KEY` (startup fails if the key is missing).
- [ ] `WEB_URL`/`API_URL` set to public HTTPS origins; `COOKIE_SECURE=true`; `TRUST_PROXY=true` behind a load balancer.
- [ ] `EMAIL_PROVIDER=resend` (or SMTP) with a verified sender domain for `EMAIL_FROM`.
- [ ] Google OAuth: authorized redirect URI `https://<api-origin>/api/auth/google/callback`.

**Data**

- [ ] PostgreSQL 16 with the `vector` extension (AWS RDS, Cloud SQL, Neon, Supabase all support pgvector).
- [ ] Run `RUN_MIGRATIONS=true` on exactly one API instance (or a release job running `prisma migrate deploy`).
- [ ] Redis with persistence (AOF) and `maxmemory-policy noeviction` (BullMQ requirement).
- [ ] S3 bucket, private, SSE enabled, lifecycle rules per your retention policy; IAM credentials scoped to the bucket.
- [ ] Persistent volume or baked layer for `EMBEDDING_CACHE_DIR` so workers don't re-download the model.

**Serving**

- [ ] TLS at the edge; serve web and API from the same site (the nginx image proxies `/api`) so the refresh cookie stays first-party.
- [ ] Health checks: liveness `GET /api/health`, readiness `GET /api/health/ready`.
- [ ] Ship JSON logs (stdout) to your log platform; alert on 5xx rate, queue depth and job failures.

## Reference topology (AWS)

```text
CloudFront ──▶ ALB ──▶ ECS service "web" (nginx) ──/api──▶ ECS service "api" (2+ tasks)
                                                         │
ECS service "worker" (autoscaled on queue depth) ◀── ElastiCache Redis
          │                                              │
          └──────────▶ RDS PostgreSQL + pgvector ◀────────┘
          └──────────▶ S3 (resumes, private)            Anthropic API · Resend
```

## Scaling

- **API** is stateless (JWT + Redis-backed rate limits) — scale horizontally behind the load balancer.
- **Workers** scale independently. Per-queue concurrency is set in
  [worker.ts](../apps/api/src/worker.ts) (resume parsing and embeddings are limited to protect the
  AI provider's rate limits).
- **10,000 resumes uploaded at once**: uploads return 202 immediately after storing the file; parsing
  jobs queue in Redis and drain at `workers × concurrency`; failed jobs retry with exponential backoff
  and are idempotent (keyed by resume id). Scale workers on queue depth; the API stays responsive.
  Embeddings run locally, so they add CPU, not API cost. For very large backfills, the Anthropic
  Message Batches API is a natural extension (50% cost, asynchronous).
- **Vector search** uses HNSW indexes; the recall pool (200) is filtered by tenant first, keeping
  latency flat as the table grows.
- **Analytics** are SQL aggregates cached for 60 s and invalidated by pipeline changes.

## Rollback

Images are immutable; roll back by redeploying the previous tag. Migrations are forward-only; write
backwards-compatible migrations (expand → migrate → contract) so the previous API version keeps
working during a rollback.
