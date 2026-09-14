-- ============================================================
-- StudyHub — runtime application settings (key/value).
--
-- First consumer: the AI provider configuration. A validated API key is
-- stored here by the admin "Validate & Save" flow; the resolver in
-- src/lib/ai-config.ts reads this table first and falls back to the
-- OPENAI_* environment variables. Keys are never written until a live
-- provider probe succeeds (validate-then-persist).
--
-- Nothing existing is altered or dropped.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
