import Database from "better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";

interface CollectJob {
  id: number;
  cardId: number;
  domain: string;
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

    const insertCollectJobStmt = this.db.prepare<[number, string], void>(`
      INSERT INTO collect_job (card_id, domain)
      VALUES (?, ?)
    `);

    const key = JSON.stringify({ type: "url", url });
    const domain = new URL(url).hostname;

    const transaction = this.db.transaction(() => {
      const existingCard = selectStmt.get(key);
      if (existingCard) return existingCard.id;

      const card = insertCardStmt.get(key, url)!;
      insertCollectJobStmt.run(card.id, domain);
      return card.id;
    });

    return transaction();
  }

  expireDomainTokens(): void {
    const stmt = this.db.prepare<[], void>(`
      DELETE FROM domain_token_lease
      WHERE leased_until <= datetime('now')
    `);
    stmt.run();
  }

  existsUnclaimedCollectJob(): boolean {
    const stmt = this.db.prepare<[], { 1: number }>(`
      SELECT 1
      FROM collect_job
      WHERE claimed_at IS NULL
      LIMIT 1
    `);
    const row = stmt.get();
    return row != null;
  }

  claimCollectJob(
    claimedBy: string,
    tokensPerDomain: number,
    leaseDurationSec: number,
  ): CollectJob | undefined {
    const claimStmt = this.db.prepare<
      [string, number],
      { id: number; card_id: number; domain: string; url: string | null }
    >(`
      WITH used_tokens AS (
        SELECT domain, COUNT(*) as count
        FROM domain_token_lease
        GROUP BY domain
      )
      UPDATE collect_job
      SET
        claimed_by = ?,
        claimed_at = datetime('now')
      WHERE id = (
        SELECT candidate.id
        FROM collect_job candidate
        LEFT JOIN used_tokens ON used_tokens.domain = candidate.domain
        WHERE candidate.claimed_at IS NULL
          AND COALESCE(used_tokens.count, 0) < ?
        ORDER BY candidate.created_at ASC
        LIMIT 1
      )
      RETURNING id, card_id, domain, (SELECT url FROM card WHERE id = card_id) AS url
    `);

    const leaseStmt = this.db.prepare<[string, number], void>(`
      INSERT INTO domain_token_lease (domain, leased_until)
      VALUES (?, datetime('now', '+' || ? || ' seconds'))
    `);

    const transaction = this.db.transaction(() => {
      const row = claimStmt.get(claimedBy, tokensPerDomain);
      if (!row) return undefined;

      leaseStmt.run(row.domain, leaseDurationSec);

      return { id: row.id, cardId: row.card_id, domain: row.domain, url: row.url };
    });

    return transaction();
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
    const revisionStmt = this.db.prepare<[number, number], { id: number; card_ids: string }>(`
      SELECT revision.id, json(card_set.card_ids) AS card_ids
      FROM deck
      JOIN revision ON deck.id = revision.deck_id
      JOIN card_set ON revision.card_set_id = card_set.id
      WHERE deck.id = ?
      AND revision.id = ?
    `);

    const latestRevisionStmt = this.db.prepare<[number], { id: number; card_ids: string }>(`
      SELECT revision.id, json(card_set.card_ids) AS card_ids
      FROM deck
      LEFT JOIN revision ON deck.id = revision.deck_id
      LEFT JOIN card_set ON revision.card_set_id = card_set.id
      WHERE deck.id = ?
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

    const cardIds = JSON.parse(revision.card_ids) as number[];
    const cards = cardIds.map((id) => cardStmt.get(id)!);

    return { id: revision.id, cards };
  }

  createRevision(deckId: number, cardIds: number[]) {
    const cardIdsJson = JSON.stringify(cardIds);

    const upsertCardSetStmt = this.db.prepare<[string], { id: number }>(`
      INSERT INTO card_set (card_ids)
      VALUES (jsonb(?))
      ON CONFLICT(card_ids) DO UPDATE SET card_ids = card_ids
      RETURNING id
    `);

    const createRevisionStmt = this.db.prepare<[number, number], { id: number }>(`
      INSERT INTO revision (deck_id, card_set_id)
      VALUES (?, ?)
      RETURNING id
    `);

    const transaction = this.db.transaction(() => {
      const cardSet = upsertCardSetStmt.get(cardIdsJson)!;
      return createRevisionStmt.get(deckId, cardSet.id)!;
    });

    return transaction();
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
