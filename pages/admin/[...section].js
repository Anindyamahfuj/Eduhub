/**
 * Next.js page for /admin/<section> (users, data, files, tools, logs...).
 *
 * The admin sidebar uses plain <a href="/admin/users"> links (full-page
 * navigation, no SPA router). On Cloudflare Pages, functions/admin/[[route]].ts
 * serves the admin shell for every /admin/* path after the server-side guard.
 * On Vercel there is no such function, so /admin/users, /admin/tools, ...
 * fell through to pages/[...slug].js, which returned the 404 page -- only
 * the exact /admin URL (which has a static public/admin/index.html) worked.
 *
 * This required catch-all (more specific than pages/[...slug].js, so Next
 * prefers it for /admin/*) serves the same ADMIN_SHELL for every section.
 * admin.js boots from location.pathname and renders the right section, and
 * authorization stays server-side in /api/admin/* (401/403 JSON).
 */
import { ADMIN_SHELL } from '../../src/client/admin-shell.js';

export default function Page({ html }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export async function getServerSideProps() {
  return { props: { html: ADMIN_SHELL } };
}
