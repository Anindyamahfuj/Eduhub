# StudyHub

StudyHub is an all-in-one digital academic workspace for students: notes, assignments, planner, flashcards, files, habits, notices, reading list, calculator, AI tools and a progress dashboard — all in one place.

This repository is the **full-stack** version. The original project was a purely static site whose data lived only in `localStorage`. The frontend is preserved **byte-for-byte**; a minimal backend (Hono + Cloudflare Pages Functions + D1) now acts as the authoritative data store, with `localStorage` retained as an offline cache.

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Original StudyHub HTML/CSS/JS — unchanged |
| API | Hono on Cloudflare Pages Functions |
| Database | Cloudflare D1 (SQLite) |
| Auth | Email + password, PBKDF2-HMAC-SHA256, D1-backed sessions |
| File storage | Local (D1-backed blobs) during development; R2-ready abstraction |
| AI | OpenAI-compatible scaffold — no LLM call enabled yet |

## URLs

- **Local**: http://localhost:3000
- **Production**: https://studyhub-b3t.pages.dev
- **Cloudflare project**: studyhub
- **Original upstream**: https://github.com/Anindyamahfuj/Eduhub

## How the frontend stays unchanged

`frontend/` holds the original StudyHub files **byte-for-byte**. At build time
`scripts/build.mjs` copies them to `public/` and appends `src/client/storage-shim.js`
to `script.js`. The build hard-fails unless the original 430,574 bytes remain an
exact prefix of the shipped file, so drift is impossible.

The shim overrides **only** `window.loadData` / `window.saveData`
(`script.js` is a classic script, so its top-level declarations are global
properties; reassigning them redirects all ~112 existing call sites). No HTML,
CSS, DOM id/class, markup or interaction is altered.

`public/_redirects` preserves the original `.html` URLs (Pages would otherwise
308-redirect `/notes.html` → `/notes`, breaking the frontend's own
`location.pathname` checks).

## Data architecture

- **Users** — email + password hash (PBKDF2-HMAC-SHA256, 100k iterations), one row per account.
- **Sessions** — random 256-bit token; only its SHA-256 hash is stored. Delivered as an HttpOnly, SameSite=Lax cookie.
- **Workspaces** — one row per user containing the entire `studyHubData` document as JSON, mirroring the frontend's existing state shape.
- **Files** — one row per file. `data` holds the base64 payload for the local driver; `storage_key` holds the R2 object key once `STORAGE_DRIVER=r2`. The API re-hydrates `files[].data` as a data URL on read, so `openFile()` is untouched.

Every data route is authenticated and strictly scoped to the requesting user, so accounts are isolated from one another.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Current user |
| GET | `/api/workspace` | Fetch the workspace document |
| PUT | `/api/workspace` | Persist the workspace document |
| POST | `/api/workspace/reset` | Reset the workspace to defaults |
| GET | `/api/files` | List uploaded files |
| POST | `/api/files` | Store uploaded files |
| DELETE | `/api/files/:id` | Delete one file |
| DELETE | `/api/files` | Delete all files |
| GET | `/api/ai/config` | AI provider status |
| GET | `/api/ai/models` | OpenAI-compatible model list |
| POST | `/api/ai/chat/completions` | OpenAI-compatible chat (returns 501 until configured) |

### Developer admin API (`/api/admin/*`)

All of these are behind `requireDeveloper` — **401** unauthenticated, **403** for a
non-developer, **200** for a developer. Authorization is decided on the server
from `users.role`; nothing is decided in the browser.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/whoami` | Confirm developer identity |
| GET | `/api/admin/overview` | Counts, module totals, recent activity |
| GET | `/api/admin/users` | Accounts (no hashes/tokens ever selected) |
| POST | `/api/admin/users/:id/role` | Grant/revoke `developer` |
| GET | `/api/admin/data` | Read-only workspace inspection |
| GET | `/api/admin/data/tables` | Real table inventory |
| GET | `/api/admin/files` | File metadata only |
| GET | `/api/admin/logs` | Audit events |
| GET | `/api/admin/system` | Live service checks |
| GET | `/api/admin/ai` | AI configuration (no call made) |

## Developer admin panel

A basic developer-only panel lives at **`/admin`** with exactly seven sections:
**Overview · Users · Data · Files · Logs · System · AI**.

- **Pages & UI** — `admin/` (own source dir, served from `/admin/*`). The student
  frontend is untouched.
- **Page guard** — `functions/admin/[[route]].ts` runs server-side for every
  `/admin` request: unauthenticated → 302 `/login.html`; student → 403; developer
  → panel. The shell is served from `src/client/admin-shell.js`, never a static
  file, so the guard cannot be bypassed by requesting the HTML directly.
- **API guard** — `requireDeveloper` (`src/lib/helpers.ts`) on `/api/admin/*`.
- **Role** — `users.role` (`'student'` | `'developer'`), added by
  `migrations/0002_admin.sql`. This is the only permission level.
- **Bootstrap** — `node scripts/promote-admin.mjs grant <email> [--remote]`
  (also `revoke`, `list`). Required because no developer exists on a fresh DB.
- **Audit log** — `audit_logs` table via `src/lib/audit.ts`; records auth
  register/login/login-failed/logout, authorization denials, admin views, role
  changes, API errors and file-upload failures.

### Admin test suites

```bash
# Authorization + sections + secrets + AI + logs
bash scripts/admin-test.sh http://localhost:3000
bash scripts/admin-test.sh https://studyhub-b3t.pages.dev   # targets prod D1

# Rendering (jsdom) — every section must actually paint content
node scripts/admin-render-test.mjs
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... \
  node scripts/admin-render-test.mjs https://studyhub-b3t.pages.dev
```

`admin-test.sh` covers the full authorization matrix, all seven sections, the
no-secrets rule, the AI no-call rule and real log events.

`admin-render-test.mjs` loads the real `admin.js` in jsdom and asserts each
section renders cards/tables without throwing. It exists because a numeric-cell
bug once made **Overview, Users and Data** show "Request failed." while the API
was perfectly healthy — no API-level test could catch that. Run it after any
change to `admin/admin.js`.

## User guide

1. Run the local server (see below) and open http://localhost:3000.
2. Sign in, or create an account.
3. Use any module — notes, assignments, planner, habits, flashcards, files, reading, calculator.
4. Your data is saved to D1 and cached locally so the app keeps working offline.

## Getting started

```bash
npm install
npm run build
npm run db:migrate:local
npm start
```

Then open http://localhost:3000.

## Deployment

- **Platform**: Cloudflare Pages (own account, Free tier)
- **Status**: ✅ Deployed (Free tier)
- **D1**: studyhub-production (bd3d6fb7-7749-43ca-bcb0-48e614b4a14c)
- **Verified**: health, register/login, workspace round-trip, byte-identical
  script.js prefix, 48/48 API + 12/12 browser regression, 36/36 admin
  authorization — all passing both locally and in production.

## AI integration

The backend is OpenAI-compatible but the LLM call is intentionally **not** enabled yet. To connect a provider later, set:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (defaults to `https://api.openai.com/v1`)
- `OPENAI_MODEL`

No key or model is assumed. Set them as Cloudflare secrets at deploy time.

## Notes

- `enhance.js` from the original repository was **not** referenced by any page and is therefore excluded.
- `login.html` is the only new page; it is required by the email/password auth decision and reuses the existing design tokens.

## Roadmap

- [ ] Connect a real OpenAI-compatible provider
- [ ] Move file storage to R2 for production
- [ ] Add a logout control to the existing navigation (behavioural change — pending approval)
- [ ] Custom domain
