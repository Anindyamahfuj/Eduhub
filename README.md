<p align="center">
  <img src="frontend/logoedu.png" alt="StudyHub Logo" width="100">
</p>

<h1 align="center">StudyHub</h1>

<p align="center">
  All-in-one digital academic workspace for students.<br>
  Notes · Assignments · Planner · Flashcards · Files · Habits · Reading · Calculator · AI Tools
</p>

<p align="center">
  <a href="https://eduhub-lac.vercel.app"><img src="https://img.shields.io/badge/-Vercel-000?style=for-the-badge&logo=vercel&logoColor=white" alt="Deploy"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-3fd2b0?style=for-the-badge" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node-22.x-3fd2b0?style=for-the-badge&logo=node.js&logoColor=white" alt="Node">
  <img src="https://img.shields.io/badge/Backend-Hono-3fd2b0?style=for-the-badge" alt="Hono">
  <img src="https://img.shields.io/badge/DB-Turso-3fd2b0?style=for-the-badge&logo=sqlite&logoColor=white" alt="Turso">
</p>

---

## What is StudyHub?

A full-featured student dashboard that runs in the browser. Originally a static `localStorage`-only app, it now has a real backend with persistent storage, email/password auth, and a developer admin panel — while keeping the original frontend intact.

| Module | What it does |
|--------|-------------|
| **Dashboard** | Progress overview, focus mode, quick stats |
| **Notes** | Rich notes with scored quizzes generated from content |
| **Assignments** | Track, filter, and complete assignments |
| **Planner** | Weekly study schedule with drag-and-drop |
| **Habits** | Daily habit tracker with streaks |
| **Flashcards** | Spaced-repetition flashcard review |
| **Files** | Upload and manage study files |
| **Reading** | Reading list with progress tracking |
| **Calculator** | Scientific calculator |
| **AI Tools** | OpenAI-compatible scaffold (bring your own key) |

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla HTML/CSS/JS — original code preserved byte-for-byte |
| Framework | Next.js (Pages Router) for Vercel deployment |
| API | Hono — lightweight, fast, edge-ready |
| Database | Turso (libSQL) on Vercel, D1 on Cloudflare |
| Auth | Email + password, PBKDF2-HMAC-SHA256, HttpOnly cookies |
| Design | Space Grotesk + DM Sans, single mint accent `#3fd2b0` |

---

## Quick Start

```bash
# Clone
git clone https://github.com/Anindyamahfuj/Eduhub.git
cd Eduhub

# Install
npm install

# Build frontend + bundle backend
npm run build

# Start dev server
npm run dev
```

Open **http://localhost:3000** — you're in.

---

## Project Structure

```
├── frontend/          Student UI (HTML/CSS/JS) — the core app
├── src/               Hono backend (routes, libs, DB shim)
├── pages/             Next.js pages — bridge between Vercel and frontend
├── admin/             Admin panel (CSS + JS)
├── migrations/        SQL schema (D1/Turso)
├── scripts/           Build, test, and utility scripts
├── public/            Built output (auto-generated)
└── vercel.json        Vercel routing config
```

---

## API

<details>
<summary><strong>Auth</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Current user |

</details>

<details>
<summary><strong>Workspace</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspace` | Fetch workspace data |
| PUT | `/api/workspace` | Save workspace data |
| POST | `/api/workspace/reset` | Reset to defaults |

</details>

<details>
<summary><strong>Files</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files` | List files |
| POST | `/api/files` | Upload file |
| DELETE | `/api/files/:id` | Delete file |
| DELETE | `/api/files` | Delete all files |

</details>

<details>
<summary><strong>Admin (developer only)</strong></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/whoami` | Confirm identity |
| GET | `/api/admin/overview` | Dashboard stats |
| GET | `/api/admin/users` | List accounts |
| GET | `/api/admin/data` | Workspace inspection |
| GET | `/api/admin/logs` | Audit events |
| GET | `/api/admin/system` | Health checks |

</details>

---

## Admin Panel

A developer-only panel at `/admin` with seven sections: **Overview · Users · Data · Files · Logs · System · AI**.

Bootstrap your first admin:

```bash
node scripts/promote-admin.mjs grant you@example.com
```

---

## Deployment

### Vercel (primary)

```bash
npm run build
vercel --prod
```

Set environment variables in the Vercel dashboard:
- `TURSO_DATABASE_URL` — your Turso DB URL
- `TURSO_AUTH_TOKEN` — your Turso auth token
- `DEVELOPER_EMAILS` — comma-separated emails for admin access

### Cloudflare Pages

The repo also deploys to Cloudflare Pages with D1. See `wrangler.jsonc` for config.

---

## Roadmap

- [ ] Connect a real AI provider
- [ ] File storage via R2
- [ ] Custom domain
- [ ] Mobile app (PWA)

---

## License

[MIT](LICENSE) — use it however you want.

---

<p align="center">
  Built with care by <a href="https://github.com/Anindyamahfuj">Anindya Mahfuja</a>
</p>
