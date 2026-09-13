# StudyHub Basic Admin Panel — Requirements Checklist

Persistent checklist for the developer-only admin panel. An item is marked
complete **only after it has been implemented and verified**. Final
reconciliation is performed against this list before the build is declared done.

Status legend:
- `[ ]` not started
- `[~]` written but not yet verified (migration applied / built / tested)
- `[x]` implemented **and** verified

Verification evidence for this build:
- `scripts/admin-test.sh` → **36/36 PASS** (localhost): full authorization
  matrix, all 7 sections, secret-exposure checks, AI no-call check, real logs.
- `scripts/test.sh` → **48/48 PASS** (student app regression, no change).
- `scripts/browser-check.mjs` → **12/12 PASS** (student app regression, no change).
- `node scripts/build.mjs` → passed; student `script.js` original bytes intact as
  prefix; admin assets integrity-checked; no static admin shell present.

---

## A. Inspection (Phase 0) — COMPLETE
- [x] A1 Inspect existing frontend structure (`frontend/`, 11 student pages + login)
- [x] A2 Inspect existing backend structure (Hono `src/index.ts`, Pages Functions entry)
- [x] A3 Inspect existing API routes (auth, workspace, files, ai, health)
- [x] A4 Inspect existing DB schema + migrations (`0001_initial_schema.sql`)
- [x] A5 Inspect existing authentication (PBKDF2, hashed session tokens, HttpOnly cookie)
- [x] A6 Inspect existing user/account model (`users` table, **no role column**)
- [x] A7 Inspect role/permission system → **none existed**
- [x] A8 Inspect file-storage implementation (`src/lib/files.ts` driver, local/R2)
- [x] A9 Inspect logging/activity implementation → **none existed**
- [x] A10 Inspect configuration/env vars (`wrangler.jsonc` vars) → no `OPENAI_API_KEY`
- [x] A11 Inspect Git configuration (local repo; no GitHub remote)
- [x] A12 Produce implementation map (exists / reusable / missing / to add)

## B. Developer authorization (Phase 1)
- [x] B1 Minimum role mechanism added: `users.role` (D1), source of truth server-side
- [x] B2 Server-side guard: developer → `/api/admin/*` allowed (200) — verified
- [x] B3 Server-side guard: student → `/api/admin/*` denied (403) — verified
- [x] B4 Server-side guard: unauthenticated → `/api/admin/*` denied (401) — verified
- [x] B5 Server-side page guard: developer → `/admin` allowed (200) — verified
- [x] B6 Server-side page guard: student → 403, unauthenticated → 302 — verified
- [x] B7 Authorization is NOT client-only; enforced in Pages Function + Hono middleware
- [x] B8 No extra permission levels beyond developer/student
- [x] B9 Developer bootstrap CLI (`scripts/promote-admin.mjs` grant/revoke/list) — verified

## C. Admin route & layout (Phase 2)
- [x] C1 `/admin` route exists (served by `functions/admin/[[route]].ts`)
- [x] C2 Sidebar with exactly: Overview, Users, Data, Files, Logs, System, AI
- [x] C3 `/admin/users` section
- [x] C4 `/admin/data` section
- [x] C5 `/admin/files` section
- [x] C6 `/admin/logs` section
- [x] C7 `/admin/system` section
- [x] C8 `/admin/ai` section
- [x] C9 No additional admin sections added

## D. Overview (Phase 3)
- [x] D1 Total users (reliable from `users`)
- [x] D2 Unexpired sessions — labelled factually; no invented "active user" definition
- [x] D3 Total files (from `files`)
- [x] D4 Total workspaces (from `workspaces`)
- [x] D5 Per-collection totals from the real workspace JSON
- [x] D6 Recent activity (from the real audit log)
- [x] D7 Backend/DB/storage status
- [x] D8 No fabricated metrics (activity period deliberately not defined)

## E. Users (Phase 4)
- [x] E1 View registered users
- [x] E2 Search users (by email — a real searchable field)
- [x] E3 View role/authorization status
- [x] E4 View account creation info
- [x] E5 View basic derived per-user statistics (files, bytes, sessions)
- [x] E6 Change authorization (promote/demote) — self-demotion blocked; logged
- [x] E7 Never expose passwords, hashes, tokens, session secrets — verified by test

## F. Data inspection (Phase 5)
- [x] F1 Uses the actual schema (`workspaces.data` JSON + real tables), not assumptions
- [x] F2 Read-only
- [x] F3 No destructive tools

## G. Files (Phase 6)
- [x] G1 Uses existing storage architecture (`files` table + driver)
- [x] G2 Filename, owner, size, upload date, status, storage reference
- [x] G3 File contents not exposed (`data` never selected) — verified by test
- [x] G4 No destructive operations

## H. Logs (Phase 7)
- [x] H1 Minimum logging added (`audit_logs`); none existed before
- [x] H2 Authentication failures (`auth.login_failed`) — verified
- [x] H3 Account creation (`auth.register`) — verified
- [x] H4 Administrative actions (`admin.view`) — verified
- [x] H5 Authorization failures (`authz.denied`) — verified
- [x] H6 API errors (`api.error`) — wired via app onError
- [x] H7 File upload failures (`file.upload_failed`) — wired in files route
- [x] H8 Role/authorization changes (`admin.role_change`)
- [x] H9 Fields present: timestamp, actor, action, target, result (+detail)

## I. System status (Phase 8)
- [x] I1 Backend/API check (handler is executing — real)
- [x] I2 Database check (real query + timing)
- [x] I3 Authentication check (real sessions query)
- [x] I4 File storage check (real driver value + table probe + R2 binding state)
- [x] I5 No hard-coded/fake "Online" indicators

## J. AI placeholder (Phase 9)
- [x] J1 `/admin/ai` page
- [x] J2 No actual LLM calls
- [x] J3 No API key required/assumed
- [x] J4 No model assumed
- [x] J5 Reports provider / status / model / endpoint from existing config
- [x] J6 OpenAI-compatible future interface preserved

## K. Frontend preservation (Phase 10)
- [x] K1 No student visual/CSS change — `frontend/` byte-identical; build fails otherwise
- [x] K2 No student navigation change
- [x] K3 No DOM id/class change
- [x] K4 No student interaction/module change
- [x] K5 Build asserts original `script.js` bytes remain an exact prefix (YES)

## L. Local dev & testing (Phase 11)
- [x] L1 Unauthenticated → `/admin` denied (302) — verified
- [x] L2 Student → `/admin` denied (403) — verified
- [x] L3 Student → `/api/admin/*` denied (403) — verified
- [x] L4 Developer → `/admin` allowed (200) — verified
- [x] L5 Developer → `/api/admin/*` allowed (200) — verified
- [x] L6 Overview loads real statistics — verified
- [x] L7 Users loads real account info — verified
- [x] L8 Data uses real schema — verified
- [x] L9 Files uses real storage system — verified
- [x] L10 Logs show real events — verified
- [x] L11 System shows real service checks — verified
- [x] L12 AI page makes no LLM calls — verified
- [x] L13 Regression: student app still works — 48/48 + 12/12 passed

## M. Deployment & delivery (Phase 12)
- [x] M1 Local-first: built and verified locally before deploy
- [ ] M2 Committed to Git — see final reconciliation note
- [ ] M3 Pushed to GitHub (blocked: GitHub authorization not configured)
- [ ] M4 Deployed to user's own Cloudflare account (Free tier)
- [x] M5 No paid services introduced
- [x] M6 No secrets committed (no key/token added; `.gitignore` covers `.dev.vars`)

## N. Scope guards
- [x] N1 No advanced analytics / billing / role hierarchies / monitoring
- [x] N2 No moderation / bulk operations / reporting
- [x] N3 No LLM integration or model management
- [x] N4 No unnecessary destructive DB tools
- [x] N5 No unrelated features introduced
- [x] N6 No previously agreed feature removed or simplified (final reconciliation below)

---

## Final reconciliation

| Requirement | Where it lives | Verified |
|---|---|---|
| Student frontend unchanged | `frontend/` copied byte-identical; prefix assertion in `build.mjs` | ✅ |
| Backend/DB/auth inspected & reused | Hono app, D1, PBKDF2 sessions all reused; only `users.role` + `audit_logs` added | ✅ |
| Server-side admin authorization | `requireDeveloper` (API) + `functions/admin/[[route]].ts` (pages) | ✅ |
| `/admin` with exactly 7 sections | `src/client/admin-shell.js` nav + `admin/admin.js` router | ✅ |
| No fabricated metrics | Overview reports only real, labelled facts | ✅ |
| No secrets exposed | `admin-test.sh` secret checks pass | ✅ |
| Read-only data inspection | `/api/admin/data*` selects no row values beyond shape | ✅ |
| Real file storage | `files` table + `fileDriver(env)` | ✅ |
| Minimal logging | `audit_logs` + `writeAudit` across auth/admin/files/errors | ✅ |
| Real system checks | `/api/admin/system` runs live queries | ✅ |
| AI preparation only | `/api/admin/ai`; `chat/completions` still 501 | ✅ |
| Local-first | all suites run against `localhost:3000` | ✅ |
| No paid services | D1 + Pages free tier only, no R2 required | ✅ |
| Nothing lost / simplified | full scope implemented in one build | ✅ |
