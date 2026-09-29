# Public demo deployment (free tier)

The public demo runs on three free services:

```text
Browser ──▶ Vercel (web app, apps/web) ──/api/* rewrite──▶ Render (API, Docker, single process)
                                                            ├─▶ Supabase Postgres (pgvector)
                                                            └─▶ Supabase Storage (S3 API, resumes)
```

- The API runs as **one process**: `QUEUE_DRIVER=inline` executes background jobs in-process, so no
  Redis and no separate worker are needed. Tested with a 512 MB memory limit (Render free):
  about 70 MB idle, 170 MB after the embedding model loads, and a 400 MB peak while seeding.
- Vercel proxies `/api/*` to Render, so the browser only talks to one origin and the refresh-token
  cookie stays first-party.
- `TRUST_PROXY=2` (Vercel edge → Render proxy) makes per-IP rate limits see the real client IP.

The full production setup (Redis, separate workers) is described in [DEPLOYMENT.md](DEPLOYMENT.md).

## 1. Supabase: database and storage

1. Create a project at [supabase.com](https://supabase.com) (region: the same one you'll pick on
   Render, e.g. Singapore). Save the database password.
2. **Connection string:** click **Connect** → **Session pooler** (works over IPv4) and copy the
   URI. Replace `[YOUR-PASSWORD]` with your password. It looks like
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
3. **Storage bucket:** **Storage** → **New bucket** → name `hireflow-resumes`, keep it **private**.
4. **S3 keys:** **Storage** → **Settings** (S3 Connection) → note the **Endpoint** and **Region**,
   then **New access key** and copy the access key ID and secret.

## 2. Render: the API

1. Sign in to [render.com](https://render.com) with GitHub → **New** → **Blueprint** → pick this
   repository. Render reads [render.yaml](../render.yaml).
2. Fill in the values it asks for:

   | Variable        | Value                                                       |
   | --------------- | ----------------------------------------------------------- |
   | `WEB_URL`       | the Vercel URL, e.g. `https://web-zeta-beige-54.vercel.app` |
   | `API_URL`       | the same Vercel URL (the API is reached through Vercel)     |
   | `DATABASE_URL`  | Supabase session-pooler URI from step 1                     |
   | `S3_ENDPOINT`   | Supabase S3 endpoint                                        |
   | `S3_REGION`     | Supabase S3 region                                          |
   | `S3_ACCESS_KEY` | Supabase access key ID                                      |
   | `S3_SECRET_KEY` | Supabase secret access key                                  |
   | `AI_API_KEY`    | optional Anthropic key; leave empty for heuristic mode      |

3. Deploy. Migrations run automatically on start. Note the service URL
   (e.g. `https://hireflow-api.onrender.com`) and check that `<url>/api/health/ready` responds with status 200.

## 3. Demo data

Seed the hosted database once, from your machine, using the same Docker image. Create
`.env.demo` in the repository root (git-ignored) with the same values as on Render:

```bash
NODE_ENV=production
ALLOW_DEMO_SEED=true
QUEUE_DRIVER=inline
STORAGE_DRIVER=s3
S3_FORCE_PATH_STYLE=true
S3_BUCKET=hireflow-resumes
DATABASE_URL=...
S3_ENDPOINT=...
S3_REGION=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
JWT_SECRET=any-random-string-of-32-or-more-characters
JWT_REFRESH_SECRET=another-random-string-of-32-or-more-chars
```

Then run:

```bash
docker build -f docker/api.Dockerfile -t hireflow-api .
docker run --rm --env-file .env.demo hireflow-api node dist/seed.js
```

Demo accounts (password `HireFlowDemo!2026`): `recruiter@demo.hireflow.local`,
`hiring.manager@demo.hireflow.local`, `candidate@demo.hireflow.local`.

## 4. Vercel: route /api to Render

Add the API rewrite in [apps/web/vercel.json](../apps/web/vercel.json), **before** the SPA
fallback, and push:

```json
{ "source": "/api/:path*", "destination": "https://hireflow-api.onrender.com/api/:path*" }
```

## 5. Keep it awake

Render's free plan sleeps after 15 minutes idle, and Supabase pauses projects after a week
without activity. In GitHub → **Settings** → **Secrets and variables** → **Actions** →
**Variables**, add `DEMO_API_URL` = the Render URL. The
[keep-alive workflow](../.github/workflows/keep-alive.yml) then pings the API every 10 minutes.
