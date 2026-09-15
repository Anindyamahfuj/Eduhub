/**
 * Next.js page for the bare /admin URL.
 *
 * Why this exists alongside pages/admin/[...section].js:
 *   `[...section]` is a REQUIRED catch-all, so it matches /admin/users but
 *   NOT /admin itself. Bare /admin therefore fell through to
 *   pages/[...slug].js, which resolved "public/admin" -- a DIRECTORY --
 *   and readFileSync() threw EISDIR: every visit to /admin returned 500.
 *
 *   On Vercel this never showed because build.mjs materializes a static
 *   public/admin/index.html there (VERCEL=1); on Cloudflare Pages the
 *   functions/admin/[[route]].ts guard serves the shell. Local Next dev had
 *   neither, so the panel's canonical URL was simply unreachable.
 *
 * Serving the same ADMIN_SHELL for /admin and /admin/<section> keeps one
 * source of truth (src/client/admin-shell.js). admin.js reads
 * location.pathname and renders the right section; authorization stays
 * server-side in /api/admin/* (401/403 JSON), exactly as on the other hosts.
 */
import { ADMIN_SHELL } from '../../src/client/admin-shell.js';

export default function Page({ html }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export async function getServerSideProps() {
  return { props: { html: ADMIN_SHELL } };
}
