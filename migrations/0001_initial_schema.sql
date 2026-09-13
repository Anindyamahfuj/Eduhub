-- StudyHub schema — users, sessions, workspaces, files.
-- localStorage remains an offline cache; D1 is authoritative.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One row per user holding the entire StudyHub workspace document as JSON.
-- Mirrors the frontend's `studyHubData` shape (file blobs excluded — see below).
CREATE TABLE IF NOT EXISTS workspaces (
  user_id    TEXT PRIMARY KEY,
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- File blobs, kept out of the workspace JSON so large payloads cannot bloat a
-- single row. The API re-hydrates files[].data as a data URL on read, so the
-- existing frontend contract is unchanged.
--
--   storage_key = NULL          -> bytes live in `data` (local/D1 driver)
--   storage_key = 'r2:<key>'    -> bytes live in R2 (populated after deploy)
CREATE TABLE IF NOT EXISTS files (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  size        INTEGER NOT NULL DEFAULT 0,
  mime        TEXT NOT NULL DEFAULT 'application/octet-stream',
  data        TEXT,
  storage_key TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_files_user       ON files(user_id);
