import { YakatakDb, type CollectJob } from "@yakatak/db";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrowserProxy, createBrowserProxy, createCDPBrowserProxy } from "./browser.ts";
import { collectPage } from "./drivers/page.ts";
import { collectZulip } from "./drivers/zulip.ts";

const MAX_CONCURRENT_JOBS = 5;
const TOKENS_PER_DOMAIN = 2;
const TOKEN_LEASE_DURATION_SEC = 5;
const POLL_DELAY_MS = 1000;

class CollectorApp {
  private db: YakatakDb;
  private stateDir: string;
  private browser: BrowserProxy;
  private disposer = new AsyncDisposableStack();
  private workerId = `collector:${os.hostname()}:${process.pid}`;
  private active: Set<Promise<void>> = new Set();
  public draining = false;

  static async new(dbPath: string) {
    const browser = process.env.CDP_URL
      ? await createCDPBrowserProxy(process.env.CDP_URL)
      : await createBrowserProxy();

    const db = new YakatakDb(dbPath);
    await db.init();

    const stateDir = path.resolve(path.dirname(dbPath), "scrape");

    return new CollectorApp(db, stateDir, browser);
  }

  private constructor(db: YakatakDb, stateDir: string, browser: BrowserProxy) {
    this.db = this.disposer.adopt(db, () => db.close());
    this.stateDir = stateDir;
    this.browser = this.disposer.use(browser);
  }

  async [Symbol.asyncDispose]() {
    await this.disposer.disposeAsync();
  }

  async run({ oneshot }: { oneshot: boolean }) {
    console.info(`Starting collector worker ${this.workerId}`);

    while (true) {
      if (this.draining) break;
      if (this.active.size === MAX_CONCURRENT_JOBS) {
        await Promise.race(this.active);
        continue;
      }

      this.db.expireDomainTokens();
      const job = this.db.claimCollectJob(
        this.workerId,
        TOKENS_PER_DOMAIN,
        TOKEN_LEASE_DURATION_SEC,
      );
      if (!job) {
        if (oneshot && !this.db.existsUnclaimedCollectJob()) break;
        await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
        continue;
      }

      const promise = this.processJob(job)
        .catch((e) => {
          console.error("Job failed:", e);
          process.exitCode = 1;
        })
        .finally(() => this.active.delete(promise));
      this.active.add(promise);
    }

    await Promise.allSettled(this.active);
  }

  private async processJob(job: CollectJob) {
    const collectedAt = new Date().toISOString();
    const dir = path.join(this.stateDir, "" + job.id);
    await fs.mkdir(dir);

    await using context = await this.browser.newContext(path.join(dir, "har.zip"));
    let collection;
    if (job.source.type === "page") {
      collection = collectPage(context, job.source.url);
    } else if (job.source.type === "zulip") {
      collection = collectZulip(context, job.source.url);
    } else {
      throw new Error("Unsupported source", job.source);
    }

    const cardIds = [];

    const jobMetadata = { collectedAt, worker: this.workerId };

    let i = 0; // AsyncIterator does not have .entries()
    for await (const detail of collection) {
      const detailImagePath = path.join(dir, `${i}-w1024.png`);
      await fs.writeFile(detailImagePath, detail.image);

      const result = this.db.saveDetail(detail.cardKey, detail.url, detail.title, detailImagePath, {
        ...detail.metadata,
        ...jobMetadata,
      });
      cardIds.push(result.cardId);

      i++;
    }

    // Pages are preallocated into a deck, but Zulip needs its deck to be created.
    if (job.source.type === "zulip") {
      const deck = this.db.createDeck();
      this.db.createRevision(deck.id, cardIds);
    }

    if (context.harPath != undefined) {
      await context.close();
      this.db.saveCrawl(job.source.url, context.harPath, jobMetadata);
    }
    this.db.deleteCollectJob(job.id);
  }
}

async function main() {
  const [, scriptPath, mode, dbPath, ...extraArgs] = process.argv;
  if ((mode !== "--oneshot" && mode !== "--daemon") || !dbPath || extraArgs.length > 0) {
    console.error(`Usage: npx tsx ${scriptPath} (--oneshot|--daemon) <database-path>`);
    process.exit(1);
  }

  await using app = await CollectorApp.new(dbPath);

  function handleShutdown(signal: string) {
    if (app.draining) {
      console.info("Forcefully shutting down...");
      process.exit(1);
    }
    console.info("Gracefully shutting down...");
    app.draining = true;
  }

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  await app.run({ oneshot: mode === "--oneshot" });
}

await main();
