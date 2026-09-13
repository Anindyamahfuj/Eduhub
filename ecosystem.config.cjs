// PM2 configuration — local development server.
//
// Serves the built output (public/) plus the Pages Functions API on port 3000.
//
// IMPORTANT: do NOT pass `--d1=...` on the command line. That flag keys the
// local database by binding name only, which creates a SECOND, empty local DB
// separate from the one `wrangler d1 migrations apply` writes to — the API then
// fails with "no such table: users". Letting wrangler.jsonc supply the binding
// keeps migrations and runtime pointed at the same local SQLite file.
module.exports = {
  apps: [
    {
      name: 'studyhub',
      script: 'npx',
      args: 'wrangler pages dev public --local --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
