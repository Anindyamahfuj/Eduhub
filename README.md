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
| File storage | Local disk during development; R2-ready abstraction |
| AI | OpenAI-compatible scaffold — no LLM call enabled yet |

## URLs

- **Local**: http://localhost:3000
- **Production**: https://studyhub-b3t.pages.dev
- **Cloudflare project**: studyhub
- **Repository**: https://github.com/Anindyamahfuj/Eduhub

## Data architecture

- **Users** — email + password hash, one row per account.
- **Sessions** — random 256-bit token; only its SHA-256 hash is stored.
- **Workspaces** — one row per user containing the entire `studyHubData` document as JSON, mirroring the frontend's existing state shape.
- **Files** — metadata rows; bytes are handled by the storage driver.

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
- **Verified**: health, register/login, workspace round-trip, byte-identical script.js prefix, all 48 local tests

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
