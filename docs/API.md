# API

REST API served under `/api`. The **interactive OpenAPI documentation** is generated at runtime
from the same route table and Zod schemas that validate requests, so it cannot drift from the code:

- Swagger UI: `http://localhost:4000/api/docs`
- OpenAPI JSON: `http://localhost:4000/api/docs/openapi.json` (72 operations)

This page describes the conventions and gives an overview; the OpenAPI document is authoritative
for request/response details.

## Conventions

**Success envelope**

```json
{
  "success": true,
  "data": {},
  "message": "Optional human-readable message",
  "meta": { "pagination": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 } }
}
```

**Error envelope**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": {
      "location": "body",
      "issues": [{ "path": "title", "message": "Too small", "code": "too_small" }]
    },
    "requestId": "9cf5c4c1-6c32-468b-a016-2dd20893080f"
  }
}
```

| Code                     | HTTP | Meaning                                                                            |
| ------------------------ | ---- | ---------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`       | 400  | Body/query/params failed Zod validation (`details.issues[]`)                       |
| `UNAUTHORIZED`           | 401  | Missing/expired access token or invalid credentials                                |
| `FORBIDDEN`              | 403  | Authenticated but not allowed (role/permission/tenant)                             |
| `NOT_FOUND`              | 404  | Missing — also returned for resources in another organization                      |
| `CONFLICT`               | 409  | Duplicate (e.g. email, application) or stale Kanban move (`details.currentStatus`) |
| `INVALID_STATE`          | 409  | Illegal transition (e.g. publish without requirements)                             |
| `PAYLOAD_TOO_LARGE`      | 413  | Upload over `MAX_UPLOAD_MB`                                                        |
| `UNSUPPORTED_MEDIA_TYPE` | 415  | Non-PDF upload (checked by file signature)                                         |
| `RATE_LIMITED`           | 429  | Too many requests                                                                  |
| `AI_UNAVAILABLE`         | 503  | AI provider unavailable, refused or returned invalid output                        |
| `INTERNAL_ERROR`         | 500  | Unexpected error (details logged server-side with the request id)                  |

**Authentication**

1. `POST /api/auth/login` (or `/register`) returns `{ accessToken, expiresIn, user, memberships }` and sets an httpOnly `hf_refresh` cookie (path `/api/auth`).
2. Send `Authorization: Bearer <accessToken>` on every request.
3. When a request returns 401, call `POST /api/auth/refresh` (cookie only). The refresh token rotates; replaying an old one revokes the session family.
4. Staff requests are scoped to an organization. The server picks the caller's first membership, or the one named in `X-Organization-Id` **if the caller is a member**.

**Pagination & filters** — `page`, `pageSize` (≤ 100); list filters accept comma-separated values (`status=APPLIED,SCREENING`).

**Request ids** — every response carries `X-Request-Id` (an incoming one is reused if well-formed). Error bodies include it for support.

**Rate limits** — global 300/min per IP; auth endpoints 20 failed attempts / 15 min; AI endpoints 20/min per user; uploads 30/hour per user. Headers follow the IETF `RateLimit` draft.

## Endpoint overview

### Auth

| Method      | Path                                                                    | Access                                    |
| ----------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| GET         | `/auth/config`                                                          | public — Google enabled, AI provider mode |
| POST        | `/auth/register` · `/auth/login` · `/auth/refresh` · `/auth/logout`     | public                                    |
| POST        | `/auth/verify-email` · `/auth/forgot-password` · `/auth/reset-password` | public                                    |
| POST        | `/auth/resend-verification` · `/auth/change-password`                   | user                                      |
| GET / PATCH | `/auth/me`                                                              | user                                      |
| GET         | `/auth/google` · `/auth/google/callback`                                | public (redirects)                        |

### Organizations & team

| Method         | Path                                 | Permission                                         |
| -------------- | ------------------------------------ | -------------------------------------------------- |
| POST           | `/organizations`                     | user (staff without an org)                        |
| GET / PATCH    | `/organizations/current`             | `org:read` / `org:update` (incl. matching weights) |
| GET / POST     | `/organizations/current/members`     | `team:read` / `team:manage`                        |
| PATCH / DELETE | `/organizations/current/members/:id` | `team:manage`                                      |
| GET            | `/organizations/current/audit-logs`  | `audit:read`                                       |

### Jobs

| Method               | Path                                     | Permission                                                                |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| GET / POST           | `/jobs`                                  | `jobs:read` / `jobs:write`                                                |
| POST                 | `/jobs/analyze`                          | `jobs:write` — AI analysis, returns editable requirements (not persisted) |
| GET / PATCH / DELETE | `/jobs/:id`                              | `jobs:read` / `jobs:write` / `jobs:delete`                                |
| POST                 | `/jobs/:id/duplicate`                    | `jobs:write`                                                              |
| POST                 | `/jobs/:id/{publish,pause,close,reopen}` | `jobs:publish`                                                            |
| GET                  | `/jobs/:id/applications`                 | `applications:read`                                                       |
| POST                 | `/jobs/:id/applications`                 | candidate — apply                                                         |
| GET                  | `/public/jobs` · `/public/jobs/:slug`    | public                                                                    |

### Candidates & resumes

| Method       | Path                                           | Access                                                           |
| ------------ | ---------------------------------------------- | ---------------------------------------------------------------- |
| GET / PATCH  | `/candidates/me`                               | candidate                                                        |
| PUT          | `/candidates/me/{skills,experience,education}` | candidate                                                        |
| GET          | `/candidates/me/dashboard`                     | candidate                                                        |
| GET          | `/candidates?q=…`                              | `candidates:read` — hybrid semantic search when `q` is present   |
| GET          | `/candidates/:id`                              | `candidates:read` (only candidates who applied to the org)       |
| POST         | `/resumes/upload` (multipart `file`)           | candidate — returns **202**; parsing is queued                   |
| GET / DELETE | `/resumes`, `/resumes/:id`                     | candidate (owner) / owner or staff of an org it was submitted to |
| GET          | `/resumes/:id/download`                        | owner, or staff of an org it was submitted to (audited)          |
| POST         | `/resumes/:id/{retry,primary}`                 | candidate                                                        |

### Applications, matching, interviews

| Method     | Path                                                               | Permission                                             |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| GET        | `/applications`, `/applications/pipeline`, `/applications/:id`     | `applications:read`                                    |
| PATCH      | `/applications/:id/status`                                         | `applications:move` — `{ status, fromStatus?, note? }` |
| POST       | `/applications/:id/notes`                                          | `applications:read`                                    |
| GET / POST | `/applications/:id/match`                                          | `applications:read` / `matching:run`                   |
| GET / POST | `/applications/:id/interview-questions`                            | `interviews:read` / `interviews:write`                 |
| GET / POST | `/interviews`, PATCH `/interviews/:id`                             | `interviews:read` / `interviews:write`                 |
| GET        | `/applications/mine`, `/applications/mine/:id`, `/interviews/mine` | candidate                                              |
| POST       | `/applications/mine/:id/withdraw`                                  | candidate                                              |

### Copilot & analytics

| Method       | Path                                                                      | Permission                                             |
| ------------ | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| POST         | `/copilot/chat`                                                           | `copilot:use` — `{ message, conversationId?, jobId? }` |
| GET / DELETE | `/copilot/conversations[/:id]`, GET `/copilot/conversations/:id/messages` | `copilot:use`                                          |
| GET          | `/analytics/dashboard`                                                    | `analytics:read` (cached 60 s in Redis)                |

### System

`GET /health` (liveness) · `GET /health/ready` (database + Redis)

## Example

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"recruiter@demo.hireflow.local","password":"HireFlowDemo!2026"}' | jq -r .data.accessToken)

curl -s -G localhost:4000/api/candidates -H "Authorization: Bearer $TOKEN" \
  --data-urlencode 'q=React developer with strong backend experience and real-time applications' | jq '.data[] | {firstName, similarity, matchReasons}'
```
