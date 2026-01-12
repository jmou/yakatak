import { YakatakDb } from "@yakatak/db";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { createBrowserProxy, createCDPBrowserProxy } from "./browser.ts";
import { collectZulip } from "./drivers/zulip.ts";

async function main() {
  const [, scriptPath, dbPath, stateDir, ...extraArgs] = process.argv;
  if (!dbPath || !stateDir || extraArgs.length > 0) {
    console.error(`Usage: node ${scriptPath} <database-path> <state-directory>`);
    process.exit(1);
  }

  const db = new YakatakDb(dbPath);
  await db.init();

  await fs.mkdir(stateDir, { recursive: true });

  // TODO record HAR
  await using browser = process.env.CDP_URL
    ? await createCDPBrowserProxy(process.env.CDP_URL)
    : await createBrowserProxy();

  await using context = await browser.newContext();

  const zulipUrl = "https://recurse.zulipchat.com/#narrow/is/starred";

  for await (const detail of collectZulip(context, zulipUrl)) {
    const { metadata } = detail;

    metadata.collectedAt = new Date().toISOString();
    metadata.hostname = os.hostname();

    const uuid = crypto.randomUUID();
    const dir = `${stateDir}/${uuid}`;
    await fs.mkdir(dir);

    const detailImagePath = `${dir}/w1024.png`;
    await fs.writeFile(detailImagePath, detail.image);
    db.saveDetail(detail.cardKey, detail.url, detail.title, detailImagePath, metadata);
  }
}

await main();
