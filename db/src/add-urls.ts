import Database from "better-sqlite3";
import { ensureDatabaseSchema } from "./index.ts";

const stdin = await new Promise<string>((resolve) => {
  const chunks: Buffer[] = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () =>
    resolve(Buffer.concat(chunks).toString("utf-8"))
  );
});

async function main() {
  const [, scriptPath, dbPath, ...extraArgs] = process.argv;
  if (!dbPath || extraArgs.length > 0) {
    console.error(`usage: node ${scriptPath} <db-path> < <urls>`);
    process.exit(1);
  }

  const db = new Database(dbPath);
  await ensureDatabaseSchema(db);

  const stmt = db.prepare<[string], void>(`
    INSERT INTO collect_job (source)
    VALUES (jsonb(?))
    ON CONFLICT(source) DO NOTHING
  `);

  for (const url of stdin.split("\n").filter(Boolean)) {
    const source = { type: "url", url };
    stmt.run(JSON.stringify(source));
  }

  db.close();
}

await main();
