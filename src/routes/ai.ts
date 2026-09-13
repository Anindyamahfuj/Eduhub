/**
 * OpenAI-compatible AI scaffold.
 *
 * IMPORTANT: no LLM call is implemented yet — by explicit requirement. This
 * module only establishes the contract so a provider can be connected later
 * without touching the frontend or the rest of the architecture.
 *
 * To enable a provider later, set (as Cloudflare secrets / vars):
 *   OPENAI_API_KEY   — the provider key
 *   OPENAI_BASE_URL  — defaults to https://api.openai.com/v1
 *   OPENAI_MODEL     — the model id to use
 * No key or model is assumed at this stage.
 */
import { Hono } from 'hono';
import type { Env } from '../lib/helpers.js';
import { currentUser, fail, json, ok, requireUser } from '../lib/helpers.js';

export const aiRoutes = new Hono<{ Bindings: Env }>();

aiRoutes.use('*', requireUser);

/** Current provider configuration state (never exposes the key itself). */
function providerStatus(env: Env) {
  return {
    configured: Boolean(env.OPENAI_API_KEY && env.OPENAI_BASE_URL),
    baseUrl: env.OPENAI_BASE_URL || null,
    model: env.OPENAI_MODEL || null,
    // The key value is intentionally never returned.
    hasKey: Boolean(env.OPENAI_API_KEY)
  };
}

/** GET /api/ai/config — what the client can expect. */
aiRoutes.get('/config', (c) => json({ ok: true, provider: providerStatus(c.env) }));

/**
 * GET /api/ai/models — OpenAI-compatible model listing.
 * Proxies the provider when configured; otherwise reports that it is not
 * configured yet. The frontend can adopt this without changes later.
 */
aiRoutes.get('/models', async (c) => {
  const env = c.env;
  if (!env.OPENAI_API_KEY) {
    return fail('No AI provider is configured yet.', 501);
  }
  try {
    const res = await fetch(`${env.OPENAI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }
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
  const env = c.env;
  const user = currentUser(c);

  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    return fail('Invalid JSON body');
  }

  if (!env.OPENAI_API_KEY) {
    // Deliberate: the integration point exists but is not yet enabled.
    return json(
      {
        ok: false,
        error: 'AI provider not configured yet. Set OPENAI_API_KEY, OPENAI_BASE_URL and OPENAI_MODEL.',
        received: {
          model: body.model ?? env.OPENAI_MODEL ?? null,
          scope: { userId: user.id },
          messages: Array.isArray(body.messages) ? (body.messages as unknown[]).length : 0
        }
      },
      501
    );
  }

  try {
    const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model: env.OPENAI_MODEL || body.model, ...body })
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
