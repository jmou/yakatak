import { YakatakDb } from "./index.ts";

const stdin = await new Promise<string>((resolve) => {
  const chunks: Buffer[] = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
});

async function main() {
  const [, scriptPath, dbPath, ...extraArgs] = process.argv;
  if (!dbPath || extraArgs.length > 0) {
    console.error(`usage: node ${scriptPath} <db-path> < <urls>`);
    process.exit(1);
  }

  const db = new YakatakDb(dbPath);
  await db.init();

  const cardIds: number[] = [];
  for (const url of stdin.split("\n").filter(Boolean)) {
    const cardId = db.enqueueCard(url);
    cardIds.push(cardId);
  }

  const deck = db.createDeck();
  const revision = db.createRevision(deck.id, cardIds);
  console.log(`Created deck ${deck.id} revision ${revision.id}`);

  db.close();
}

await main();
