-- ============================================================
-- StudyHub — admin-managed site tools.
--
-- One row per tool in the student navigation. The admin panel can
-- show/hide, rename, re-icon, reorder (builtins) and create/delete
-- (customs) from here; the student site reads the enabled set via
-- GET /api/tools and applies it to the nav at runtime.
--
-- Nothing existing is altered or dropped.
-- ============================================================

CREATE TABLE IF NOT EXISTS site_tools (
  id         TEXT PRIMARY KEY,               -- slug: 'calculator' or 'my-tool'
  kind       TEXT NOT NULL DEFAULT 'builtin',-- 'builtin' | 'custom'
  label      TEXT NOT NULL,
  href       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '',       -- Phosphor name ('ph-calculator') or a short glyph
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_site_tools_order ON site_tools(sort_order);

-- The 11 builtin tools, in the current nav order. Labels are stored WITHOUT
-- the decorative emoji: icons come from the `icon` column. `enabled = 1`
-- reproduces today's nav exactly, so applying this migration changes nothing
-- until a developer edits the set in the admin panel.
INSERT INTO site_tools (id, kind, label, href, icon, sort_order, enabled) VALUES
  ('dashboard',   'builtin', 'Dashboard',   'index.html',       'ph-squares-four',   10, 1),
  ('ai-tools',    'builtin', 'AI Tools',    'ai-tools.html',    'ph-robot',          20, 1),
  ('calculator',  'builtin', 'Calculator',  'calculator.html',  'ph-calculator',     30, 1),
  ('files',       'builtin', 'Files',       'files.html',       'ph-folder-open',    40, 1),
  ('habits',      'builtin', 'Habits',      'habits.html',      'ph-fire',           50, 1),
  ('notice',      'builtin', 'Notice',      'notice.html',      'ph-megaphone',      60, 1),
  ('notes',       'builtin', 'Notes',       'notes.html',       'ph-note-pencil',    70, 1),
  ('assignments', 'builtin', 'Assignments', 'assignments.html', 'ph-clipboard-text', 80, 1),
  ('planner',     'builtin', 'Planner',     'planner.html',     'ph-calendar-blank', 90, 1),
  ('flashcards',  'builtin', 'Flashcards',  'flashcards.html',  'ph-cards',         100, 1),
  ('reading',     'builtin', 'Reading',     'reading.html',     'ph-book-open',     110, 1);
