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

CREATE TABLE capture (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  title TEXT,
  detail_image_file_id INTEGER NOT NULL,
  har_file_id INTEGER,
  -- e.g., jsonb('{"captured_at": "2025-10-16T05:17:00Z"}')
  metadata BLOB,
  FOREIGN KEY(card_id) REFERENCES card(id) ON DELETE RESTRICT,
  FOREIGN KEY(detail_image_file_id) REFERENCES file(id) ON DELETE RESTRICT,
  FOREIGN KEY(har_file_id) REFERENCES file(id) ON DELETE SET NULL
);

CREATE INDEX idx_capture_card_id ON capture(card_id);

CREATE TABLE thumbnail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id INTEGER NOT NULL UNIQUE,
  file_id INTEGER NOT NULL,
  FOREIGN KEY(capture_id) REFERENCES capture(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id) REFERENCES file(id) ON DELETE RESTRICT
);

CREATE TABLE tile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id INTEGER NOT NULL,
  tile_index INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  FOREIGN KEY(capture_id) REFERENCES capture(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id) REFERENCES file(id) ON DELETE RESTRICT,
  UNIQUE(capture_id, tile_index)
);

CREATE INDEX idx_tile_capture_id ON tile(capture_id);
CREATE INDEX idx_tile_file_id ON tile(file_id);

CREATE TABLE collect_job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- e.g., jsonb('{"type": "url", "url": "http://example.com/"}')
  source BLOB NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  claimed_by TEXT
);

CREATE INDEX idx_collect_job_claimed_at ON collect_job(claimed_at) WHERE claimed_at IS NULL;

CREATE TABLE snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_snapshot_created_at ON snapshot(created_at DESC);
