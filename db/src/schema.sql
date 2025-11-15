CREATE TABLE file (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE
);

CREATE TABLE card (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- e.g., jsonb('{"type": "url", "url": "http://example.com/"}')
  key BLOB NOT NULL UNIQUE,
  url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_card_created_at ON card(created_at DESC);

CREATE TABLE detail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  image_file_id INTEGER NOT NULL,
  title TEXT,
  -- e.g., jsonb('{"crawl_id": 42}')
  metadata BLOB,
  FOREIGN KEY(card_id) REFERENCES card(id) ON DELETE RESTRICT,
  FOREIGN KEY(image_file_id) REFERENCES file(id) ON DELETE RESTRICT
);

CREATE INDEX idx_detail_card_id ON detail(card_id);

CREATE TABLE thumbnail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  detail_id INTEGER NOT NULL UNIQUE,
  file_id INTEGER NOT NULL,
  FOREIGN KEY(detail_id) REFERENCES detail(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id) REFERENCES file(id) ON DELETE RESTRICT
);

CREATE TABLE tile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  detail_id INTEGER NOT NULL,
  tile_index INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  FOREIGN KEY(detail_id) REFERENCES detail(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id) REFERENCES file(id) ON DELETE RESTRICT,
  UNIQUE(detail_id, tile_index)
);

CREATE INDEX idx_tile_detail_id ON tile(detail_id);
CREATE INDEX idx_tile_file_id ON tile(file_id);

CREATE TABLE crawl (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  har_file_id INTEGER NOT NULL,
  title TEXT,
  -- e.g., jsonb('{"crawled_at": "2025-10-16T05:17:00Z"}')
  metadata BLOB,
  FOREIGN KEY(har_file_id) REFERENCES file(id) ON DELETE SET NULL
);

CREATE TABLE collect_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  claimed_by TEXT,
  FOREIGN KEY(card_id) REFERENCES card(id) ON DELETE RESTRICT
);

CREATE INDEX idx_collect_job_claimed_at ON collect_job(claimed_at) WHERE claimed_at IS NULL;

CREATE TABLE postprocess_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  detail_id INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  claimed_by TEXT,
  FOREIGN KEY(detail_id) REFERENCES detail(id) ON DELETE RESTRICT
);

CREATE INDEX idx_postprocess_job_detail_id ON postprocess_job(detail_id);
CREATE INDEX idx_postprocess_job_claimed_at ON postprocess_job(claimed_at) WHERE claimed_at IS NULL;

CREATE TABLE snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_snapshot_created_at ON snapshot(created_at DESC);

CREATE TABLE deck (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE card_set (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- e.g., jsonb('[1, 2, 3]')
  card_ids BLOB NOT NULL UNIQUE
);

CREATE TABLE revision (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deck_id INTEGER NOT NULL,
  card_set_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(deck_id) REFERENCES deck(id) ON DELETE CASCADE,
  FOREIGN KEY(card_set_id) REFERENCES card_set(id) ON DELETE RESTRICT
);

-- insert: card_id IS NOT NULL AND old_position IS NULL
-- move/replace: card_id IS NOT NULL AND old_position IS NOT NULL
-- delete: card_id IS NULL
CREATE TABLE delta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  old_position INTEGER,
  card_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(revision_id) REFERENCES revision(id) ON DELETE CASCADE,
  FOREIGN KEY(card_id) REFERENCES card(id) ON DELETE RESTRICT
);
