/**
 * Public site-tools API — /api/tools
 *
 * Returns every navigation tool with an `enabled` flag, in order, for the
 * student site. This route is intentionally UNAUTHENTICATED: the nav renders
 * on every page, including pre-login pages.
 *
 * It leaks nothing sensitive: the table holds only nav labels, hrefs, icon
 * names and sort order.
 *
 * Fail-open contract with the frontend shim: if the table does not exist yet
 * (migration not applied) the route returns an empty list with `available:
 * false`, and the shim leaves the default nav untouched instead of blanking it.
 */
import { Hono } from 'hono';
import type { Env } from '../lib/helpers.js';
import { json } from '../lib/helpers.js';

export const toolRoutes = new Hono<{ Bindings: Env }>();

export interface SiteTool {
  id: string;
  kind: string;
  label: string;
  href: string;
  icon: string;
  sortOrder: number;
  enabled: boolean;
}

/** The full table (enabled AND disabled), ordered — the student nav's source.
 *
 * Disabled rows are included ON PURPOSE with `enabled: false`: the client
 * shim needs them to (a) keep a disabled tool's direct URL from staying open
 * and (b) hide its nav item without flicker. The rows hold only labels,
 * hrefs, icon names and order — nothing sensitive; the pages themselves stay
 * reachable by URL either way.
 */
toolRoutes.get('/', async (c) => {
  let rows: Array<{
    id: string;
    kind: string;
    label: string;
    href: string;
    icon: string;
    sort_order: number;
    enabled: number;
  }> = [];

  try {
    const result = await c.env.DB.prepare(
      `SELECT id, kind, label, href, icon, sort_order, enabled FROM site_tools
        ORDER BY sort_order, label`
    ).all<{
      id: string;
      kind: string;
      label: string;
      href: string;
      icon: string;
      sort_order: number;
      enabled: number;
    }>();
    rows = result.results || [];
  } catch {
    // Migration not applied (fresh checkout). Fail open: the shim keeps the
    // default nav.
    return json({ ok: true, available: false, tools: [] });
  }

  return json({
    ok: true,
    available: true,
    tools: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      href: r.href,
      icon: r.icon,
      sortOrder: r.sort_order,
      enabled: Boolean(r.enabled)
    }))
  });
});
