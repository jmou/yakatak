import Database from "better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";

interface UrlSource {
  type: "url";
  url: string;
}

interface CollectJob {
  id: number;
  source: UrlSource;
}

interface Card {
  id: number;
  url: string | null;
  title: string | null;
  numTiles: number;
}

interface File {
  path: string;
}

interface Snapshot {
  id: number;
  createdAt: string;
}

export async function ensureDatabaseSchema(
  db: Database.Database,
): Promise<void> {
  // Heuristic if database is initialized by looking for card table.
  const tableExists = db
    .prepare<
      [],
      { count: number }
    >("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='card'")
    .get();
  if (tableExists!.count > 0) return;

  const schemaPath = path.join(import.meta.dirname, "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf-8");
  db.exec(schema);

  console.log("Initialized database schema");
}

export class YakatakDb {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("foreign_keys = ON");
  }

  async init() {
    return ensureDatabaseSchema(this.db);
  }

  close() {
    this.db.close();
  }

  claimCollectJob(claimedBy: string): CollectJob | undefined {
    const stmt = this.db.prepare<[string], { id: number; source: string }>(`
      UPDATE collect_job
      SET claimed_at = datetime('now'), claimed_by = ?
      WHERE id = (
        SELECT id FROM collect_job
        WHERE claimed_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1
      )
      RETURNING id, json(source) AS source
    `);

    const row = stmt.get(claimedBy);

    return row
      ? { id: row.id, source: JSON.parse(row.source) as UrlSource }
      : undefined;
  }

  completeCollectJob(
    collectJobId: number,
    cardKey: {},
    url: string | null,
    title: string | null,
    detailImagePath: string,
    harPath: string | null,
    metadata: {},
  ): void {
    const deleteJob = this.db.prepare<[number], void>(`
      DELETE FROM collect_job WHERE id = ?
    `);

    const upsertCard = this.db.prepare<
      [string, string | null],
      { id: number }
    >(`
      INSERT INTO card (key, url)
      VALUES (jsonb(?), ?)
      ON CONFLICT(key) DO UPDATE SET url = excluded.url
      RETURNING id
    `);

    const ensureFile = this.db.prepare<[string], { id: number }>(`
      INSERT INTO file (path)
      VALUES (?)
      ON CONFLICT(path) DO UPDATE SET path = excluded.path
      RETURNING id
    `);

    const createDetail = this.db.prepare<
      [number, number, string | null, string],
      { id: number }
    >(`
      INSERT INTO detail (card_id, image_file_id, title, metadata)
      VALUES (?, ?, ?, jsonb(?))
      RETURNING id
    `);

    const createCrawl = this.db.prepare<
      [string, number, string | null, string],
      void
    >(`
      INSERT INTO crawl (url, har_file_id, title, metadata)
      VALUES (?, ?, ?, jsonb(?))
    `);

    const createPostprocessJob = this.db.prepare<[number], void>(`
      INSERT INTO postprocess_job (detail_id)
      VALUES (?)
    `);

    const transaction = this.db.transaction(() => {
      const card = upsertCard.get(JSON.stringify(cardKey), url)!;
      const detailImageFile = ensureFile.get(detailImagePath)!;
      const harFile = harPath ? ensureFile.get(harPath)! : null;

      const detail = createDetail.get(
        card.id,
        detailImageFile.id,
        title,
        JSON.stringify(metadata),
      )!;

      if (harFile && url) {
        createCrawl.run(url, harFile.id, title, JSON.stringify(metadata))!;
      }

      createPostprocessJob.run(detail.id);

      deleteJob.run(collectJobId);
    });

    transaction();
  }

  // TODO use deck table
  getAllCards(): Card[] {
    const stmt = this.db.prepare<[], Card>(`
      SELECT
        card.id,
        card.url,
        detail.title,
        COUNT(tile.id) AS numTiles
      FROM card
      LEFT JOIN detail ON detail.id = (
        SELECT id FROM detail
        WHERE card_id = card.id
        ORDER BY id DESC
        LIMIT 1
      )
      LEFT JOIN tile ON tile.detail_id = detail.id
      GROUP BY card.id
      ORDER BY card.created_at DESC
    `);
    return stmt.all();
  }

  getThumbnailPath(cardId: number): string | undefined {
    const stmt = this.db.prepare<[number], File>(`
      SELECT file.path
      FROM detail
      JOIN thumbnail ON thumbnail.detail_id = detail.id
      JOIN file ON file.id = thumbnail.file_id
      WHERE detail.card_id = ?
      ORDER BY detail.id DESC
      LIMIT 1
    `);
    return stmt.get(cardId)?.path;
  }

  getTilePath(cardId: number, tileIndex: number): string | undefined {
    const stmt = this.db.prepare<[number, number], File>(`
      SELECT file.path
      FROM detail
      JOIN tile ON tile.detail_id = detail.id
      JOIN file ON file.id = tile.file_id
      WHERE detail.card_id = ? AND tile.tile_index = ?
      ORDER BY detail.id DESC
      LIMIT 1
    `);
    return stmt.get(cardId, tileIndex)?.path;
  }

  listSnapshots(): Snapshot[] {
    const stmt = this.db.prepare<[], { id: number; created_at: string }>(`
      SELECT id, created_at
      FROM snapshot
      ORDER BY created_at DESC
    `);
    return stmt.all().map((row) => ({ id: row.id, createdAt: row.created_at }));
  }

  getSnapshot(id: number): {} | undefined {
    const stmt = this.db.prepare<[number], { data: string }>(
      "SELECT data FROM snapshot WHERE id = ?",
    );
    const row = stmt.get(id);
    return row ? JSON.parse(row.data) : undefined;
  }

  saveSnapshot(data: {}): void {
    const stmt = this.db.prepare<[string], void>(`
      INSERT INTO snapshot (data)
      VALUES (?)
      ON CONFLICT(id) DO UPDATE SET data = excluded.data
    `);
    stmt.run(JSON.stringify(data));
  }
}
