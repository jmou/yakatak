import Database from "better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";

interface CollectJob {
  id: number;
  cardId: number;
  url: string | null;
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

export async function ensureDatabaseSchema(db: Database.Database): Promise<void> {
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

  enqueueCard(url: string): number {
    const selectStmt = this.db.prepare<[string], { id: number }>(`
      SELECT id FROM card WHERE key = jsonb(?)
    `);

    const insertCardStmt = this.db.prepare<[string, string], { id: number }>(`
      INSERT INTO card (key, url)
      VALUES (jsonb(?), ?)
      RETURNING id
    `);

    const insertCollectJobStmt = this.db.prepare<[number], void>(`
      INSERT INTO collect_job (card_id)
      VALUES (?)
    `);

    const key = JSON.stringify({ type: "url", url });

    const transaction = this.db.transaction(() => {
      const existingCard = selectStmt.get(key);
      if (existingCard) return existingCard.id;

      const card = insertCardStmt.get(key, url)!;
      insertCollectJobStmt.run(card.id);
      return card.id;
    });

    return transaction();
  }

  claimCollectJob(claimedBy: string): CollectJob | undefined {
    const stmt = this.db.prepare<[string], { id: number; card_id: number; url: string | null }>(`
      UPDATE collect_job
      SET claimed_at = datetime('now'), claimed_by = ?
      WHERE id = (
        SELECT id FROM collect_job
        WHERE claimed_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1
      )
      RETURNING id, card_id, (SELECT url FROM card WHERE id = card_id) AS url
    `);

    const row = stmt.get(claimedBy);

    return row ? { id: row.id, cardId: row.card_id, url: row.url } : undefined;
  }

  completeCollectJob(
    collectJobId: number,
    title: string | null,
    detailImagePath: string,
    harPath: string | null,
    metadata: {},
  ): void {
    const getJobInfo = this.db.prepare<[number], { id: number; url: string | null }>(`
      SELECT card.id, card.url
      FROM card
      JOIN collect_job ON card.id = collect_job.card_id
      WHERE collect_job.id = ?
    `);

    const deleteJob = this.db.prepare<[number], void>(`
      DELETE FROM collect_job WHERE id = ?
    `);

    const ensureFile = this.db.prepare<[string], { id: number }>(`
      INSERT INTO file (path)
      VALUES (?)
      ON CONFLICT(path) DO UPDATE SET path = excluded.path
      RETURNING id
    `);

    const createDetail = this.db.prepare<[number, number, string | null, string], { id: number }>(`
      INSERT INTO detail (card_id, image_file_id, title, metadata)
      VALUES (?, ?, ?, jsonb(?))
      RETURNING id
    `);

    const createCrawl = this.db.prepare<[string, number, string | null, string], void>(`
      INSERT INTO crawl (url, har_file_id, title, metadata)
      VALUES (?, ?, ?, jsonb(?))
    `);

    const createPostprocessJob = this.db.prepare<[number], void>(`
      INSERT INTO postprocess_job (detail_id)
      VALUES (?)
    `);

    const transaction = this.db.transaction(() => {
      const card = getJobInfo.get(collectJobId)!;

      const detailImageFile = ensureFile.get(detailImagePath)!;
      const harFile = harPath ? ensureFile.get(harPath)! : null;

      const detail = createDetail.get(
        card.id,
        detailImageFile.id,
        title,
        JSON.stringify(metadata),
      )!;

      if (harFile && card.url) {
        createCrawl.run(card.url, harFile.id, title, JSON.stringify(metadata))!;
      }

      createPostprocessJob.run(detail.id);

      deleteJob.run(collectJobId);
    });

    transaction();
  }

  listDecks() {
    const stmt = this.db.prepare<[], { id: number }>(`
      SELECT id FROM deck
    `);
    return stmt.all();
  }

  createDeck() {
    const stmt = this.db.prepare<[], { id: number }>(`
      INSERT INTO deck DEFAULT VALUES
      RETURNING id
    `);
    return stmt.get()!;
  }

  getRevision(deckId: number, revisionId?: number) {
    const revisionStmt = this.db.prepare<
      [number, number],
      { id: number | null; card_ids: string | null }
    >(`
      SELECT revision.id, json(revision.card_ids) AS card_ids
      FROM deck
      JOIN revision ON deck.id = revision.deck_id
      WHERE deck.id = ?
      AND revision.id = ?
    `);

    const latestRevisionStmt = this.db.prepare<
      [number],
      { id: number | null; card_ids: string | null }
    >(`
      SELECT revision.id, json(revision.card_ids) AS card_ids
      FROM deck
      LEFT JOIN revision ON deck.id = revision.deck_id
      WHERE deck.id = ?
      AND revision.hidden = 0
      ORDER BY revision.id DESC
      LIMIT 1
    `);

    const cardStmt = this.db.prepare<[number], Card>(`
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
      WHERE card.id = ?
      GROUP BY card.id
    `);

    const revision = revisionId
      ? revisionStmt.get(deckId, revisionId)
      : latestRevisionStmt.get(deckId);
    if (!revision) return undefined;

    const cardIds = revision.card_ids ? (JSON.parse(revision.card_ids) as number[]) : [];
    const cards = cardIds.map((id) => cardStmt.get(id)!);

    return { id: revision.id, cards };
  }

  createRevision(deckId: number, cardIds: number[], hidden: boolean) {
    // Optimization to avoid duplicate revisions when saving for undo.
    if (hidden) {
      const stmt = this.db.prepare<[number, string], { id: number }>(`
        SELECT id
        FROM revision
        WHERE deck_id = ?
        AND card_ids = jsonb(?)
        ORDER BY id DESC
        LIMIT 1
        `);
      const row = stmt.get(deckId, JSON.stringify(cardIds));
      if (row) return row;
    }

    const stmt = this.db.prepare<[number, string, number], { id: number }>(`
      INSERT INTO revision (deck_id, card_ids, hidden)
      VALUES (?, jsonb(?), ?)
      RETURNING id
    `);
    return stmt.get(deckId, JSON.stringify(cardIds), hidden ? 1 : 0)!;
  }

  appendDelta(
    deckId: number,
    revisionId: number,
    position: number,
    oldPosition: number | null,
    cardId: number | null,
  ) {
    // TODO check that revision.deck_id = deckId
    const stmt = this.db.prepare<[number, number, number | null, number | null], void>(`
      INSERT INTO delta (revision_id, position, old_position, card_id)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(revisionId, position, oldPosition, cardId);
  }

  getDeltas(decks: { deckId: number; revisionId: number }[], sinceDeltaId: number) {
    const stmt = this.db.prepare<
      [string, number],
      {
        id: number;
        deck_id: number;
        revision_id: number;
        position: number;
        old_position: number | null;
        url: string | null;
      }
    >(`
      SELECT
        delta.id,
        deck.id AS deck_id,
        revision.id AS revision_id,
        delta.position,
        delta.old_position,
        card.url
      FROM delta
      JOIN revision ON revision.id = delta.revision_id
      JOIN deck ON deck.id = revision.deck_id
      JOIN json_each(?) j
        ON deck.id = json_extract(j.value, '$.deckId')
        AND revision.id = json_extract(j.value, '$.revisionId')
      LEFT JOIN card ON card.id = delta.card_id
      WHERE delta.id >= ?
      ORDER BY delta.id
      `);

    return stmt.all(JSON.stringify(decks), sinceDeltaId).map((row) => ({
      id: row.id,
      deckId: row.deck_id,
      revisionId: row.revision_id,
      position: row.position,
      oldPosition: row.old_position,
      url: row.url,
    }));
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
