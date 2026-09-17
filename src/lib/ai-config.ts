/**
 * AI provider configuration — the single owner of this concern.
 *
 * A developer pastes an OpenAI-compatible API key in the admin panel. The
 * key is IDENTIFIED (prefix -> provider catalog), VALIDATED (a real GET
 * {baseUrl}/models probe with the pasted key) and only then PERSISTED to
 * the app_settings table (validate-then-persist). Unvalidated key material
 * is never stored, and only stored keys are ever put into use.
 *
 * Resolution order: database (validated) first, environment variables
 * (OPENAI_*) as fallback — so production secret management keeps working.
 *
 * Security posture: key material never appears in responses (masked hint
 * only), never in logs or audit entries, and every admin endpoint here is
 * behind the developer guard in routes/admin.ts.
 */
import type { Env } from './helpers.js';

/* ------------------------------------------------------------ provider catalog */

export interface ProviderSpec {
  id: string;
  label: string;
  baseUrl: string;
  /** Suggested default model id, when the catalog knows one. */
  model: string | null;
}

/** Prefix-keyed catalog; first match wins (longest prefixes listed first). */
const PROVIDERS: Array<{ prefix: string; spec: ProviderSpec }> = [
  { prefix: 'sk-or-', spec: { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: null } },
  { prefix: 'sk-', spec: { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' } },
  { prefix: 'gsk_', spec: { id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: null } },
  { prefix: 'AIza', spec: { id: 'gemini', label: 'Gemini (OpenAI-compatible)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: null } }
];

/** Resolve a pasted key to a provider spec. Returns null when unknown. */
export function identifyProvider(key: string): ProviderSpec | null {
  for (const p of PROVIDERS) {
    if (key.startsWith(p.prefix)) return p.spec;
  }
  return null;
}

/* ---------------------------------------------------------------- shape checks */

export interface KeyCheck {
  ok: boolean;
  error?: string;
}

/** Cheap sanity-check before spending a network round-trip on a probe. */
export function checkKeyShape(key: string): KeyCheck {
  if (!key || key.length < 20) return { ok: false, error: 'Key looks too short to be a valid API key.' };
  if (key.length > 300) return { ok: false, error: 'Key is implausibly long.' };
  if (/\s/.test(key)) return { ok: false, error: 'Key must not contain whitespace.' };
  if (/[<>"'`]/.test(key)) return { ok: false, error: 'Key contains invalid characters.' };
  return { ok: true };
}

export function checkUrlShape(url: string): KeyCheck {
  try {
    const u = new URL(url);
    const isLoopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]' || u.hostname.endsWith('.local');
    if (u.protocol !== 'https:' && !isLoopback) {
      // http is allowed only for local model servers (LM Studio, Ollama, ...).
      return { ok: false, error: 'Base URL must use https (http is allowed only for localhost).', };
    }
    if (!u.hostname) return { ok: false, error: 'Base URL has no host.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Base URL is not a valid URL.' };
  }
}

/* -------------------------------------------------------------------- settings */

const SETTING_KEYS = ['ai_provider', 'ai_api_key', 'ai_base_url', 'ai_model', 'ai_key_hint', 'ai_validated_at'] as const;

export interface AiConfig {
  apiKey: string | null;
  baseUrl: string | null;
  model: string | null;
  provider: string | null;
  /** Where the active configuration came from. */
  source: 'database' | 'environment' | 'none';
  /** Masked key for display, e.g. `sk-…9xQf`. Safe to show. */
  keyHint: string | null;
  validatedAt: string | null;
}

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '•••';
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

type Settings = Record<string, string>;

async function readSettings(env: Env): Promise<Settings> {
  const placeholders = SETTING_KEYS.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT key, value FROM app_settings WHERE key IN (${placeholders})`)
    .bind(...SETTING_KEYS)
    .all<{ key: string; value: string }>();
  const out: Settings = {};
  for (const r of rows.results || []) out[r.key] = r.value;
  return out;
}

/**
 * Active AI configuration. Validated database settings win; environment
 * variables are the fallback; otherwise nothing is configured.
 */
export async function getAiConfig(env: Env): Promise<AiConfig> {
  const s = await readSettings(env).catch(() => ({} as Settings));
  if (s.ai_api_key) {
    return {
      apiKey: s.ai_api_key,
      baseUrl: s.ai_base_url || null,
      model: s.ai_model || null,
      provider: s.ai_provider || null,
      source: 'database',
      keyHint: s.ai_key_hint || maskKey(s.ai_api_key),
      validatedAt: s.ai_validated_at || null
    };
  }
  const envKey = env.OPENAI_API_KEY || null;
  return {
    apiKey: envKey,
    baseUrl: env.OPENAI_BASE_URL || null,
    model: env.OPENAI_MODEL || null,
    provider: null,
    source: envKey ? 'environment' : 'none',
    keyHint: envKey ? maskKey(envKey) : null,
    validatedAt: null
  };
}

/** Persist a VALIDATED configuration. Call only after a successful probe. */
export async function saveAiConfig(
  env: Env,
  cfg: { apiKey: string; baseUrl: string; model: string | null; provider: string; validatedAt: string }
): Promise<void> {
  const stmt = env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  );
  await env.DB.batch([
    stmt.bind('ai_provider', cfg.provider),
    stmt.bind('ai_api_key', cfg.apiKey),
    stmt.bind('ai_base_url', cfg.baseUrl),
    stmt.bind('ai_model', cfg.model ?? ''),
    stmt.bind('ai_key_hint', maskKey(cfg.apiKey)),
    stmt.bind('ai_validated_at', cfg.validatedAt)
  ]);
}

/** Remove the database AI key (environment fallback is untouched). */
export async function clearAiConfig(env: Env): Promise<void> {
  const placeholders = SETTING_KEYS.map(() => '?').join(',');
  await env.DB.prepare(`DELETE FROM app_settings WHERE key IN (${placeholders})`)
    .bind(...SETTING_KEYS)
    .run();
}

/* ---------------------------------------------------------------- task models */

/** Task types that can have their own model override. */
export type AiTask = 'quiz' | 'flashcards' | 'planner' | 'recommend';

/** Mapping of task → model ID. Empty object means "use default for all". */
export type TaskModelMap = Partial<Record<AiTask, string>>;

const TASK_MODELS_KEY = 'ai_task_models';

/** Read the per-task model map from app_settings. Returns {} if not set. */
export async function getTaskModels(env: Env): Promise<TaskModelMap> {
  try {
    const row = await env.DB.prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .bind(TASK_MODELS_KEY)
      .first<{ value: string }>();
    if (!row?.value) return {};
    const parsed = JSON.parse(row.value);
    if (parsed && typeof parsed === 'object') return parsed as TaskModelMap;
    return {};
  } catch {
    return {};
  }
}

/** Resolve the model for a specific task. Falls back to default model. */
export async function resolveTaskModel(env: Env, task: AiTask | undefined): Promise<string | null> {
  if (!task) {
    const cfg = await getAiConfig(env);
    return cfg.model || null;
  }
  const taskModels = await getTaskModels(env);
  if (taskModels[task]) return taskModels[task]!;
  const cfg = await getAiConfig(env);
  return cfg.model || null;
}

/** Save the per-task model map. */
export async function saveTaskModels(env: Env, models: TaskModelMap): Promise<void> {
  const stmt = env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  );
  await stmt.bind(TASK_MODELS_KEY, JSON.stringify(models)).run();
}

/* ------------------------------------------------------------------- probe */

export interface ProbeResult {
  ok: boolean;
  error?: string;
  /** Number of models the provider listed (when the probe succeeded). */
  modelCount?: number;
  /** True when the requested model was found in the provider's list. */
  modelVerified?: boolean;
}

/**
 * Validate a key by listing models from the provider. Only a 200 with a
 * parseable OpenAI-style model list validates — the same call the runtime
 * scaffold makes, so passing here means the app can actually use the key.
 * When `model` is given, it must appear in the list.
 */
export async function probeProvider(opts: {
  apiKey: string;
  baseUrl: string;
  model?: string | null;
}): Promise<ProbeResult> {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/models`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      signal: AbortSignal.timeout(10_000)
    });
  } catch (e) {
    return { ok: false, error: `Could not reach the provider (${(e as Error).name === 'TimeoutError' ? 'timed out after 10s' : 'network error'}).` };
  }

  if (!res.ok) {
    const reason =
      res.status === 401 || res.status === 403
        ? 'the provider rejected the key as invalid or unauthorized'
        : res.status === 404
          ? 'the models endpoint was not found — check the base URL'
          : res.status === 429
            ? 'the provider rate-limited the probe; the key may still be valid — try again'
            : `the provider returned HTTP ${res.status}`;
    return { ok: false, error: `Validation failed: ${reason}.` };
  }

  let list: unknown;
  try {
    list = await res.json();
  } catch {
    return { ok: false, error: 'Validation failed: the provider response was not valid JSON.' };
  }

  const record = (list && typeof list === 'object' ? list : {}) as Record<string, unknown>;
  const models = Array.isArray(record.data) ? record.data : Array.isArray(record.models) ? record.models : null;
  if (!models) {
    return { ok: false, error: 'Validation failed: the provider did not return a recognizable model list.' };
  }

  const ids = models
    .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>).id ?? (m as Record<string, unknown>).name : null))
    .filter((v): v is string => typeof v === 'string');

  if (opts.model) {
    const found = ids.some((id) => id === opts.model || id.startsWith(`${opts.model}`));
    if (!found) {
      return {
        ok: false,
        error: `Validation failed: model "${opts.model}" is not in the provider's list (${ids.length} models available).`,
        modelCount: ids.length
      };
    }
    return { ok: true, modelCount: ids.length, modelVerified: true };
  }

  return { ok: true, modelCount: ids.length };
}
