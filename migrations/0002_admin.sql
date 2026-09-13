-- ============================================================
-- StudyHub — developer admin panel (minimum required mechanism).
--
-- Adds exactly two things:
--   1. a single `role` column on users. Values: 'student' (default)
--      and 'developer'. No further permission levels are introduced.
--   2. an audit log table, because no logging/activity system existed.
--
-- Nothing existing is altered or dropped.
-- ============================================================

-- Authorization source of truth. Server-side only.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student';

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Minimal audit trail for the admin panel: the fields that actually exist
-- in this implementation are timestamp, actor, action, target and result.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_id    TEXT,
  actor_email TEXT,
  action      TEXT NOT NULL,
  target      TEXT,
  result      TEXT NOT NULL DEFAULT 'ok',
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_logs(action);
