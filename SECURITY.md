# Security

## Reporting

This is a portfolio project. If you find a vulnerability, please open a private security advisory
on the repository rather than a public issue.

## Controls

### Authentication

- Passwords hashed with **Argon2id** (19 MiB, t=2, p=1); login verifies against a dummy hash when the
  account does not exist so timing does not reveal registered emails; the same error message is
  returned for unknown email and wrong password.
- **Access tokens**: HS256 JWT, 15 minutes, `iss`/`aud`/`exp` verified; kept in memory by the SPA
  (never localStorage).
- **Refresh tokens**: 384-bit random, stored as SHA-256 hashes, httpOnly + SameSite=Lax cookie scoped
  to `/api/auth`, `Secure` in production. Rotated on every use; replaying a rotated token revokes the
  whole token family (theft detection). Logout, password reset and password change revoke sessions.
- One-time tokens (email verification, password reset, invitations) are hashed, single-use,
  time-limited, and only the latest of each type stays valid. Forgot-password never reveals whether an
  account exists.
- Google OAuth uses the authorization-code flow with a random `state` bound to an httpOnly cookie
  and compared in constant time; only verified Google emails are accepted.

### Authorization

- Every route declares its access level in one table ([routes/index.ts](apps/api/src/routes/index.ts)):
  public, optional, user, candidate, or staff + permission.
- Staff permissions come from the organization role (`OWNER/ADMIN/RECRUITER/HIRING_MANAGER`) via a
  single permission matrix shared with the UI; the server re-checks membership on every request.
- **Tenant isolation**: the active organization is resolved from the caller's memberships
  (`X-Organization-Id` can only select one of them); every query filters by it and foreign ids return 404. Covered by integration tests.
- Candidates are visible to an organization only after applying to it; resumes only when submitted
  to it. Candidate-facing DTOs never include scores, notes or audit data.
- Frontend route guards mirror the server rules for UX only; the server is authoritative.

### Input handling

- All bodies, queries and params validated with Zod (unknown keys stripped); JSON body limit 1 MB.
- Uploads: single file, `MAX_UPLOAD_MB` limit, extension + MIME allow-list **and** PDF signature
  check, sanitized file names, random storage keys, private bucket, downloads streamed through an
  authorized endpoint with `Content-Disposition`, `nosniff` and `no-store`.
- SQL via Prisma or tagged-template raw SQL (parameterized); vector literals are generated from
  validated numeric arrays; `ILIKE` input is escaped.
- AI output is untrusted: validated with Zod, length-capped, and links restricted to `http(s)`.

### Output & browser

- React escapes output; the Markdown renderer builds React elements (no `dangerouslySetInnerHTML`);
  every rendered user/AI-provided link passes a protocol allow-list.
- Email templates HTML-escape all interpolated values.
- Helmet (CSP for the API/Swagger, frameguard, HSTS, etc.); nginx adds `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`.
- CORS allows only `WEB_URL` with credentials; in production web and API share an origin through nginx.
- Redirect targets (`?next=`) accept same-origin relative paths only.

### Abuse protection

- Rate limits (Redis-backed, shared across instances): global per IP, auth endpoints (failed attempts),
  AI endpoints and uploads per user (IPv6 grouped by subnet).
- Kanban moves use optimistic concurrency (`fromStatus`) and a conditional update to avoid lost updates.

### AI-specific

- Prompt-injection hardening: resume text and candidate-written tool results are declared as data,
  never instructions; the copilot can only reach tenant-scoped tools with validated inputs; references
  in answers are verified against retrieved data.
- Scoring is deterministic and excludes personal attributes (see [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md)).
- System prompts, API keys and internal errors are never returned to clients.

### Secrets, logging, audit

- Configuration comes only from environment variables validated at startup; `.env` is git-ignored;
  production refuses placeholder JWT secrets.
- Structured logs with request ids; authorization headers, cookies, passwords, tokens, keys, phone
  numbers and resume text are redacted; request bodies are never logged.
- Audit log for job lifecycle, status changes, shortlists/rejections, interviews, team changes,
  candidate and resume views.
- Containers run as a non-root user.

## Review log

A security review was performed at the end of implementation (Phase 16). Findings and fixes:

| #   | Finding                                                                                                                                                                    | Severity | Fix                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Links extracted from uploaded resumes were stored without protocol validation and rendered as `href`s in the recruiter UI — a crafted PDF could plant a `javascript:` URL. | High     | AI output links restricted to `http(s)` server-side (`safeHttpUrl`) and every rendered href checked client-side (`safeHref`). Unit-tested.                   |
| 2   | Recruiters could download any resume of a candidate who applied to them, including resumes never submitted to their organization.                                          | Medium   | Access requires an application in the organization that references that resume; the recruiter profile view lists only submitted resumes. Integration-tested. |
| 3   | Resume text and candidate profile text reach LLM prompts.                                                                                                                  | Medium   | Prompts treat that content strictly as data; structured outputs + Zod bound what parsing can produce; copilot tools are read-only and tenant-scoped.         |
| 4   | Per-user rate-limit keys fell back to raw IP, letting IPv6 clients rotate addresses.                                                                                       | Low      | Uses `ipKeyGenerator` (subnet grouping).                                                                                                                     |
| 5   | Registration from a job page used a client-side redirect (`next`); open-redirect risk.                                                                                     | Low      | Centralized `safeNextPath` accepts only same-origin relative paths.                                                                                          |

## Known limitations

- Registration reveals whether an email is already registered (a common UX trade-off).
- Email verification is not required to sign in (a banner prompts it).
- Scanned (image-only) PDFs are rejected rather than OCR'd.
- No malware scanning of uploads; add ClamAV or a cloud scanner before accepting untrusted files at scale.
