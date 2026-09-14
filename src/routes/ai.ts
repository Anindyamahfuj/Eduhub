/**
 * OpenAI-compatible AI scaffold.
 *
 * Configuration is resolved through getAiConfig(): validated settings saved
 * from the admin panel (app_settings table) win, OPENAI_* environment
 * variables are the fallback. A key reaches the database ONLY after the
 * admin console validated it against the live provider, so every branch
 * below can trust what it reads.
 *
 * The /chat/completions call itself is still scaffolded (501 until the chat
 * feature is switched on); /models is live and is the same call the admin
 * validation probe uses.
 */
import { Hono } from 'hono';
import type { Env } from '../lib/helpers.js';
import { currentUser, fail, json, ok, requireUser } from '../lib/helpers.js';
import { getAiConfig } from '../lib/ai-config.js';

export const aiRoutes = new Hono<{ Bindings: Env }>();

aiRoutes.use('*', requireUser);

/** Current provider configuration state (never exposes the key itself). */
async function providerStatus(env: Env) {
  const cfg = await getAiConfig(env);
  return {
    configured: Boolean(cfg.apiKey && cfg.baseUrl),
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    source: cfg.source,
    // The key value is intentionally never returned.
    hasKey: Boolean(cfg.apiKey)
  };
}

/** GET /api/ai/config — what the client can expect. */
aiRoutes.get('/config', async (c) => json({ ok: true, provider: await providerStatus(c.env) }));

/**
 * GET /api/ai/models — OpenAI-compatible model listing.
 * Proxies the provider when configured; otherwise reports that it is not
 * configured yet. The frontend can adopt this without changes later.
 */
aiRoutes.get('/models', async (c) => {
  const cfg = await getAiConfig(c.env);
  if (!cfg.apiKey || !cfg.baseUrl) {
    return fail('No AI provider is configured yet.', 501);
  }
  try {
    const res = await fetch(`${cfg.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(10_000)
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (e) {
    return fail(`Provider request failed: ${(e as Error).message}`, 502);
  }
});

/**
 * POST /api/ai/chat/completions — OpenAI-compatible chat endpoint.
 *
 * Currently returns 501 until a provider is connected, so that the route,
 * request shape, and auth scoping are already in place. The workspace context
 * (notes/assignments/planner) is accepted here and will be forwarded to the
 * model once integration is enabled.
 */
aiRoutes.post('/chat/completions', async (c) => {
  const user = currentUser(c);
  const cfg = await getAiConfig(c.env);

  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  if (!cfg.apiKey || !cfg.baseUrl) {
    // Deliberate: the integration point exists but is not yet enabled.
    return json(
      {
        ok: false,
        error: 'AI provider not configured yet. A developer can add a validated key in Admin > AI.',
        received: {
          model: body.model ?? cfg.model ?? null,
          scope: { userId: user.id },
          messages: Array.isArray(body.messages) ? (body.messages as unknown[]).length : 0
        }
      },
      501
    );
  }

  // The validated admin model wins when both are set: the developer chose it
  // deliberately, and a client-supplied model must not silently bypass that.
  const model = cfg.model || (typeof body.model === 'string' && body.model.trim()) || null;

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(60_000)
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (e) {
    return fail(`Provider request failed: ${(e as Error).message}`, 502);
  }
});
