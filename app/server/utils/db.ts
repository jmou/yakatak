import { YakatakDb } from "@yakatak/db";

let db: YakatakDb | null = null;

export async function getDb(dbPath: string): Promise<YakatakDb> {
  if (!db) {
    db = new YakatakDb(dbPath);
    await db.init();
  }
  return db;
}
