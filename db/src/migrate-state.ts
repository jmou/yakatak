import Database from "better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDatabaseSchema } from "./index.ts";

interface ScrapeMeta {
  url: string;
  timestamp: string;
  hostname: string;
}

interface DerivedData {
  title?: string;
  thumbPath: string;
  tilePaths: string[];
}

async function fileExists(path: string) {
  try {
    await fs.access(path);
  } catch {
    return false;
  }
  return true;
}

async function readScrapeMeta(scrapeDir: string): Promise<ScrapeMeta | null> {
  const metaPath = path.join(scrapeDir, "meta.json");
  try {
    const content = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function readDerivedData(scrapeDir: string): Promise<DerivedData | null> {
  const derivedDir = path.join(scrapeDir, "derived");
  const titlePath = path.join(derivedDir, "title.txt");
  const thumbPath = path.join(derivedDir, "thumb.png");
  const tilesDir = path.join(derivedDir, "tiles");

  let title: string | undefined;
  try {
    title = (await fs.readFile(titlePath, "utf-8")).trim();
  } catch {}

  if (!(await fileExists(thumbPath))) return null;

  const tilePaths: string[] = [];
  try {
    const tileFiles = (await fs.readdir(tilesDir))
      .filter((f) => f.endsWith(".png"))
      .sort((a, b) => {
        const aNum = parseInt(a.replace(".png", ""), 10);
        const bNum = parseInt(b.replace(".png", ""), 10);
        return aNum - bNum;
      });

    for (const tileFile of tileFiles) {
      tilePaths.push(path.join(tilesDir, tileFile));
    }
  } catch {
    return null;
  }

  return { title, thumbPath, tilePaths };
}

async function main() {
  const [, scriptPath, dbPath, ...scrapeDirs] = process.argv;
  if (!dbPath || scrapeDirs.length === 0) {
    console.log(`usage: node ${scriptPath} <db-path> [<scrape-dir>...]`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  await ensureDatabaseSchema(db);

  const ensureFile = db.prepare<[string], { id: number }>(`
    INSERT INTO file (path)
    VALUES (?)
    ON CONFLICT(path) DO UPDATE SET path = excluded.path
    RETURNING id
  `);

  const upsertCard = db.prepare<[string, string | null], { id: number }>(`
    INSERT INTO card (key, url)
    VALUES (jsonb(?), ?)
    ON CONFLICT(key) DO UPDATE SET url = excluded.url
    RETURNING id
  `);

  const insertDetail = db.prepare<
    [number, number, string | null, string],
    { id: number }
  >(`
    INSERT INTO detail (card_id, image_file_id, title, metadata)
    VALUES (?, ?, ?, jsonb(?))
    RETURNING id
  `);

  const insertCrawl = db.prepare<
    [string, number, string | null, string],
    void
  >(`
    INSERT INTO crawl (url, har_file_id, title, metadata)
    VALUES (?, ?, ?, jsonb(?))
  `);

  const insertThumbnail = db.prepare<[number, number], void>(`
    INSERT INTO thumbnail (detail_id, file_id)
    VALUES (?, ?)
    ON CONFLICT(detail_id) DO NOTHING
  `);

  const insertTile = db.prepare<[number, number, number], void>(`
    INSERT INTO tile (detail_id, tile_index, file_id)
    VALUES (?, ?, ?)
    ON CONFLICT(detail_id, tile_index) DO NOTHING
  `);

  for (const scrapeDir of scrapeDirs) {
    const meta = await readScrapeMeta(scrapeDir);
    const derived = await readDerivedData(scrapeDir);
    if (!meta || !derived) {
      console.log(`Skipping ${scrapeDir}`);
      continue;
    }

    const harPath = path.join(scrapeDir, "har.zip");
    let harExists = await fileExists(harPath);

    const transaction = db.transaction(() => {
      const cardKey = { type: "public", url: meta.url };
      const card = upsertCard.get(JSON.stringify(cardKey), meta.url);
      if (!card) throw new Error("Failed to insert card");

      const detailImageFile = ensureFile.get(path.join(scrapeDir, "w1024.png"));
      if (!detailImageFile)
        throw new Error("Failed to insert detail image file");

      const harFile = harExists ? ensureFile.get(harPath) : null;

      const metadata = {
        crawled_at: meta.timestamp,
        hostname: meta.hostname,
      };

      const detail = insertDetail.get(
        card.id,
        detailImageFile.id,
        derived.title ?? null,
        JSON.stringify(metadata),
      );
      if (!detail) throw new Error("Failed to insert detail");

      let crawlId: number | null = null;
      if (harFile) {
        insertCrawl.run(
          meta.url,
          harFile.id,
          derived.title ?? null,
          JSON.stringify(metadata),
        );
      }

      const thumbFile = ensureFile.get(derived.thumbPath);
      if (!thumbFile) throw new Error("Failed to insert thumb file");
      insertThumbnail.run(detail.id, thumbFile.id);

      for (let i = 0; i < derived.tilePaths.length; i++) {
        const tilePath = derived.tilePaths[i];
        if (!tilePath) continue;
        const tileFile = ensureFile.get(tilePath);
        if (!tileFile) throw new Error(`Failed to insert tile file ${i}`);
        insertTile.run(detail.id, i, tileFile.id);
      }
    });

    transaction();
  }

  db.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
