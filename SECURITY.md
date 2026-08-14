# MediScan AI — Security Documentation

Status: **security review performed August 2026; critical findings fixed.** This
document describes what is implemented, what the remaining risks are, and what
a production deployment still needs. It does **not** claim HIPAA / FDA / CE
compliance — none of that has been achieved or certified.

---

## 1. Authentication

| Concern | Implementation |
| --- | --- |
| Password storage | bcrypt, cost 12. Passwords never stored or logged in plaintext. |
| Login brute-force | Sliding window, 5 failures / 15 min, keyed on proxy-aware client IP + username. Unknown usernames answer with a dummy bcrypt hash to equalize timing (no account-existence probing). |
| Access tokens | JWT (HS256), 30 min default, claims `sub`, `role`, `type=access`, `ver` (token_version), `jti`, `exp`. |
| Refresh tokens | JWT, 7 days default, `type=refresh`, one-time-use `jti`. |
| Refresh persistence | Every API-minted refresh token is recorded in the `refresh_sessions` table (jti unique, user, expiry, revocation timestamp). Survives restarts and horizontal scaling. |
| Refresh rotation | Each refresh burns the presented token and mints a new pair. |
| Replay / theft | Presenting an already-consumed refresh token returns 401 **and revokes the entire session family**: all the user's refresh sessions are revoked and `token_version` is bumped, which also kills every outstanding access token. |
| Logout | `POST /auth/logout` revokes the presented refresh token server-side (idempotent, public — the only effect of a forged call is burning a token the caller already possessed). Access tokens expire naturally (default 30 min). |
| Revocation | Password change / role change / deactivation bumps `token_version`; access and refresh tokens embed it, so all previously issued tokens die instantly. |
| Token storage (client) | **HttpOnly cookies** — the browser SPA authenticates via `access_token` (HttpOnly, SameSite=Lax, Path=/) and `refresh_token` (HttpOnly, SameSite=Strict, Path=/api/v1/auth) cookies plus a JS-readable `csrf_token` cookie. Tokens are never stored in `localStorage` and JavaScript cannot read them. **The login/refresh JSON bodies contain no JWT material** (only a confirmation message) — browser JS can read the response body but not the HttpOnly cookies, so echoing tokens there would defeat HttpOnly; the session lives exclusively in the Set-Cookie headers. Programmatic clients read the tokens from the Set-Cookie headers and may also use `Authorization: Bearer`. |

## 2. Authorization

Role model: `doctor` / `radiologist` = full diagnostic access; `staff` =
upload + own scans only. Roles are enforced on every route via
`require_roles(...)` / `get_current_active_user`.

### Object-level authorization matrix (enforced, with tests)

| Resource | Prediction creator / scan uploader | Other doctor/radiologist | Staff (non-owner) | Unauthenticated |
| --- | --- | --- | --- | --- |
| Scan list / detail / patient history | ALLOW | ALLOW (full diagnostic access) | Own scans only | 401 |
| Prediction list / detail | ALLOW | ALLOW | Own scans only | 401 |
| **Flag prediction** | ALLOW | DENY (404) | DENY (403 role) | 401 |
| **Prediction PDF** | ALLOW | DENY (404) | DENY (404) | 401 |
| **Condition heatmap** | ALLOW | DENY (404) | DENY (404) | 401 |
| **Derived images** (original/gradcam) | ALLOW | Uploader or creator only | DENY (404) | 401 |
| **Delete scan** | ALLOW (uploader) | DENY (404) | DENY (403 role) | 401 |
| User list / update | doctor/radiologist | doctor/radiologist | DENY (403) | 401 |

Denied cross-user access returns a plain `404 Not Found` so the existence of
another clinician's record is never disclosed (no `Prediction belongs to
Doctor B` style leaks).

## 3. Data protection

- **Encryption at rest**: uploaded scans and derived images are AES-256
  (Fernet, key derived via PBKDF2-HMAC-SHA256 from `ENCRYPTION_KEY` +
  `ENCRYPTION_SALT`, 100k iterations). Decryption happens transiently in
  memory only.
- **DICOM de-identification**: whitelist approach — only safe tags + pixel
  data survive; private/vendor tags and patient identifiers are dropped;
  the institution-assigned **Study ID is removed**; Study/Series/SOP Instance
  **UIDs are replaced** with fresh values; the anonymized file is what gets
  encrypted. Multi-frame DICOM (CT volumes) is **rejected explicitly** rather
  than silently analyzed frame-by-frame.
- **No plaintext on disk**: temp upload files, anonymized copies, derived PNGs,
  and PDF image sources are cleaned up / held in memory; the PDF report is
  assembled from in-memory decrypted bytes.
- **Secrets**: `JWT_SECRET_KEY`, `ENCRYPTION_KEY`, `ENCRYPTION_SALT` must come
  from the environment. `ENVIRONMENT=production` **refuses placeholder secrets
  at startup**. `docker compose` fails fast (`:?`) when they are unset.
- **Rate limiting**: per-user sliding windows on upload + prediction (429 with
  `Retry-After`) and on login, backed by a shared sliding-window store.
  In-process by default (`InMemorySlidingWindowStore`); Redis-shared
  (`RedisSlidingWindowStore`) when `USE_REDIS=true`. `WORKERS>1` is refused at
  startup unless Redis is enabled, so the limits can never silently become
  per-process bypassable.

## 3b. CSRF protection

Authentication is cookie-based, so CSRF is mitigated in three layers:

1. **SameSite** — access cookie `Lax`, refresh cookie `Strict`; cross-site
   requests never carry the refresh cookie and only top-level navigations
   carry the access cookie.
2. **Origin verification** — every state-changing request with an `Origin`
   header must match a configured frontend origin, otherwise 403 (covers
   login CSRF too, where no cookie exists yet).
3. **Double-submit token** — cookie-authenticated state-changing requests
   must echo the `csrf_token` cookie in the `X-CSRF-Token` header; a
   cross-site attacker cannot read the cookie (same-origin policy) and
   cannot forge the header. Requests authenticated with a Bearer header are
   exempt (an attacker cannot forge that header cross-site — no CSRF surface).

All three layers are covered by regression tests (missing header 403, forged
header 403, cross-site Origin 403, correct header OK).

## 4. Demo mode

Demo functionality (bundled mock login/data/predictions/health) is **strictly
opt-in**:

- `VITE_DEMO_MODE=1` must be set at frontend build/dev time; the default is
  off (`VITE_DEMO_MODE=0`).
- Fallback engages **only** when demo mode is enabled **and** the backend is
  genuinely unreachable (network error — no HTTP response).
- Any real server response — 400/401/403/404/409/422/429/500, malformed body,
  DB error, inference error — propagates as a real error. A backend HTTP 500
  can never become a demo login or a fake prediction.
- When active, the UI shows an unmissable **DEMO MODE — results are simulated**
  banner.

## 5. Threat model

| Threat | Attack vector | Existing mitigation | Remaining risk / recommendation |
| --- | --- | --- | --- |
| Unauthenticated attacker | Guess/stuff API endpoints | JWT access tokens required on all data routes; 401 otherwise | — |
| Brute-force login | Password guessing | Rate limit by proxy-aware IP + username; bcrypt; dummy-hash timing equalization | In-process store; replace with Redis/nginx `limit_req` at scale |
| Stolen access token | XSS reading `localStorage`, network sniffing | 30-min expiry; `token_version` revocation; HTTPS recommended | Tokens are HttpOnly Secure SameSite cookies (not JS-readable) and never appear in JSON response bodies; residual risk is an XSS that runs same-origin fetch through the cookie session |
| Stolen refresh token | Replay after rotation | DB-backed rotation; replay triggers family revocation + `token_version` bump | — |
| Logout bypass | Token used after logout | Server-side revocation of refresh token; access tokens short-lived | Access token lives until expiry (≤30 min) — inherent to stateless JWTs |
| Malicious authenticated doctor | IDOR on another clinician's PDF/heatmap/flag/delete | Owner-scoped queries + safe 404; regression tests | Cross-doctor *review* of PDFs/heatmaps requires explicit sharing/assignment — not yet implemented |
| Malicious staff | Read peers' scans | Staff scoped to own uploads on every endpoint | — |
| Malicious uploaded file | Polyglot / decompression bomb / oversized image | Extension + MIME + size (Content-Length and in-memory) checks, PIL decode validation, image-quality gate at predict, 50 MB cap | No pixel-dimension cap beyond the quality gate; consider explicit max-dimension limit |
| Path traversal | `../` in image filenames | Basename check + realpath containment + ownership lookup; tested | — |
| Malicious DICOM | PHI exfiltration via metadata | Whitelist anonymization + UID replacement + StudyID removal; tests | Encapsulated-compression re-serialization is rejected loudly, not silently |
| XSS / CSRF | Injected HTML in results | React escapes by default; no `dangerouslySetInnerHTML` in scan-result rendering; bearer tokens not auto-sent (CSRF-resistant) | `localStorage` token theft (see above) |
| Secrets leak | Commit of `.env` | `.env*` gitignored; placeholder detection at startup; compose `:?` | Rotate any secret ever committed to history |
| PHI in logs | Request logging with query strings / filenames | Access logs record paths only (no query strings); audit logs never include PHI; upload log uses sanitized keys | Verify any new log call sites |
| Resource exhaustion | Inference flooding | Per-user rate limits; single-worker; inference offloaded to thread pool | In-process limiter; add Redis + autoscaling for public deployment |
| Model theft | Downloading `model.pth` | Not directly served; no API exposes it | Repository is public — the weights are public by design (hackathon artifact) |
| DB compromise | SQL injection / weak creds | SQLAlchemy parameterized queries; Postgres internal to compose network | Postgres password is a template default — change it |
| Container compromise | Escape via exposed services | Only frontend port exposed to host; backend + DB internal | Keep `BACKEND_PORT` unmapped (done); pin image digests for production |

## 6. Deployment security checklist (production)

- [ ] Real `JWT_SECRET_KEY` / `ENCRYPTION_KEY` / `ENCRYPTION_SALT` (≥32/32/16 chars, random) — placeholders are refused at startup.
- [ ] `ENVIRONMENT=production`, `DEBUG=false`, `SEED_DEMO_USERS=false`, `ALLOW_HEURISTIC_FALLBACK=false`.
- [ ] HTTPS terminated at a reverse proxy / load balancer (Caddy, nginx, ALB); HSTS; the compose stack itself runs HTTP internally.
- [ ] Only the frontend port is exposed (`BACKEND_PORT` is not mapped).
- [ ] Postgres + Redis (if added) are not exposed publicly.
- [ ] CORS allows only the real frontend origin(s) via `CORS_ORIGINS`.
- [ ] HttpOnly/Secure/SameSite cookies are active by default (this repo); CSRF layers are tested.
- [ ] `USE_REDIS=true` + reachable Redis before scaling `WORKERS>1` (enforced at startup).
- [ ] Key rotation plan for `ENCRYPTION_KEY` (Fernet keys are single-value today).
- [ ] Security headers: Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors (template: `deploy/nginx-production.conf.example`).
- [ ] Container image digests pinned; read-only root filesystem where feasible.

## 7. Testing

The suite covers (among others): the exact cross-doctor IDOR attacks (flag /
PDF / heatmap / delete / images), logout + refresh replay family revocation,
HttpOnly-cookie auth (attributes, cookie-only requests, cookie refresh
rotation), CSRF (missing/forged header, cross-site Origin), demo-mode gating
logic, DICOM PHI (StudyID removal, UID replacement, multi-frame rejection),
upload validation, path traversal, staff isolation, privilege escalation
(no admin role, no self-escalation), image-quality gate, secure checkpoint
loading (`weights_only=True`), and the sliding-window store contract.
Frontend demo gating is covered by the production typecheck/build (the
frontend has no unit-test runner).

**Live runtime verification (August 2026, this machine):** beyond the unit
suite, the production-mode stack was exercised end-to-end against a real
PostgreSQL 16 (`pg_concurrency.py`: concurrent single-use refresh — 10 parallel
refreshes of the same token yield exactly one 200; unique file-hash constraint
→ 409; `refresh_sessions` rows persisted), a live Redis 7 (`smoke_redis.py`
23/23: lockout, CSRF, rotation/replay family-revoke, per-user predict budget;
`smoke_redis_persist.py` 5/5: lockout + refresh sessions survive a backend
restart), and WORKERS=2 with `USE_REDIS=true` (`smoke_multiprocess.py` 14/14:
rate limit 429 lands on exactly the 6th call across two worker processes,
shared lockout, cross-worker rotation/replay, CSRF). A full browser smoke test
drove Chrome over nginx TLS (`browser_e2e.js` 18/18: login, HttpOnly proof
via `document.cookie`, upload, real Grad-CAM render, PDF export, logout +
refresh denial). See `verification/`.

## 7b. CSP / third-party content

- **Fonts are self-hosted** (`frontend/public/fonts/*.woff2`, `@font-face` in
  `frontend/src/fonts.css`). The production CSP is `default-src 'self'` with
  `style-src 'self' 'unsafe-inline'` and `img-src 'self' data: blob:` — no
  external origins are required, so the strict policy does not break fonts and
  the browser console shows no font/CSP errors (verified in the browser E2E
  after the self-hosting change).
- The nginx template (`deploy/nginx-production.conf.example`) ships the same
  policy plus HSTS, frame-ancestors, nosniff and Referrer-Policy.

## 8. Known limitations

1. **In-process security state by default** — rate limiting and login lockout
   use the in-memory store unless `USE_REDIS=true`. This is correct for the
   shipped single-worker deployment (`WORKERS>1` is refused without Redis).
   The Redis path is now live-verified (see §7): shared lockout, per-user
   budgets, and refresh sessions survive backend restarts and hold under
   WORKERS=2. One caveat remains: Redis persistence (RDB/AOF) is not enabled
   in the shipped compose service, so rate-limit/lockout counters disappear
   on a full Redis restart — that is acceptable because DB-backed refresh
   sessions (the security-critical state) survive independently.
2. **Cross-doctor review workflow** — doctors/radiologists can *see* the full
   list of predictions, but PDF/heatmap/flag are owner-scoped. A formal
   "share/assign case to radiologist" feature is not implemented (deliberately
   not broadened to all-access); owner-scoped security is the default.
3. **Role administration** — the three roles (doctor/radiologist/staff) are
   managed by doctors/radiologists per the documented policy; there is no
   separate admin role. Self-role/status changes are blocked and there is no
   way to escalate to a non-existent admin role.
4. **Model metrics** — `results/model.evaluation.json` reports hold-out
   performance of the shipped CNN; these are reported training/evaluation
   metrics on the Kaggle Chest X-Ray dataset, not validated real-world
   clinical performance. The UI labels them accordingly.
5. **Demo-class mismatch** — bundled frontend mock data (demo mode only) shows
   five condition classes while the shipped CNN is binary (Normal/Pneumonia).
   Demo mode is opt-in and visibly labeled; the live API only ever reports the
   real model's classes.
6. **Single-value encryption key** — no key-rotation mechanism yet.
7. **Docker not machine-validated here** — Docker is not installed on this
   machine, so `docker compose build/up` and a containerized run were not
   possible; compose/Dockerfiles were statically reviewed, and the same
   services (backend + PostgreSQL + Redis + nginx TLS) were verified running
   natively instead.
