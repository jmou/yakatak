import { YakatakDb, type CollectJob } from "@yakatak/db";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BrowserProxy, createBrowserProxy, createCDPBrowserProxy } from "./browser.ts";
import { collectPage } from "./drivers/page.ts";
import { collectZulip } from "./drivers/zulip.ts";
import { Postprocessor } from "./postprocessor.ts";

const MAX_CONCURRENT_JOBS = 5;
const TOKENS_PER_DOMAIN = 2;
const TOKEN_LEASE_DURATION_SEC = 5;
const POLL_DELAY_MS = 1000;

class CollectorApp {
  public running = true;

  private disposer = new AsyncDisposableStack();
  private workerId = `collector:${os.hostname()}:${process.pid}`;
  private active: Set<Promise<void>> = new Set();

  private db: YakatakDb;
  private stateDir: string;
  private browser: BrowserProxy;
  private postprocessor: Postprocessor;

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
    this.postprocessor = new Postprocessor(this.db);
  }

  async [Symbol.asyncDispose]() {
    await this.disposer.disposeAsync();
  }

  claimJob() {
    const postprocessJob = this.db.claimPostprocessJob(this.workerId);
    if (postprocessJob) return { type: "postprocess", data: postprocessJob } as const;

    this.db.expireDomainTokens();
    const collectJob = this.db.claimCollectJob(
      this.workerId,
      TOKENS_PER_DOMAIN,
      TOKEN_LEASE_DURATION_SEC,
    );
    if (collectJob) return { type: "collect", data: collectJob } as const;

    return undefined;
  }

  async run({ oneshot }: { oneshot: boolean }) {
    console.info(`Starting collector worker ${this.workerId}`);

    // FIXME draining and oneshot should finish postprocessing
    while (this.running) {
      if (this.active.size === MAX_CONCURRENT_JOBS) {
        await Promise.race(this.active);
        continue;
      }

      const job = this.claimJob();
      if (!job) {
        if (oneshot && !this.db.existsUnclaimedCollectJob()) break;
        await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
        continue;
      }

      const promise =
        job.type === "collect"
          ? this.processCollectJob(job.data)
          : this.postprocessor.processJob(job.data);

      promise
        .catch((e) => {
          console.error("Job failed:", e);
          process.exitCode = 1;
        })
        .finally(() => this.active.delete(promise));
      this.active.add(promise);
    }

    console.info(`Draining ${this.active.size} active job(s)...`);
    await Promise.allSettled(this.active);
  }

  private async processCollectJob(job: CollectJob) {
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

  function handleShutdown() {
    if (!app.running) {
      console.info("Forcefully shutting down...");
      process.exit(1);
    }
    console.info("Gracefully shutting down...");
    app.running = false;
  }
  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);

  await app.run({ oneshot: mode === "--oneshot" });
}

await main();
