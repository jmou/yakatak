import { YakatakDb } from "@yakatak/db";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as playwright from "playwright";

// TODO consider additional scrape formats:
// - pdf w/ text? --print-to-pdf
// - dom? https://stackoverflow.com/a/32596557/13773246
// - https://github.com/gildas-lormeau/SingleFile ? mhtml?
// - readability/mercury (@postlight?)?
// - archive.org?
// - WACZ (or WARC) would be more fit for purpose than HAR

const MAX_CONCURRENT_JOBS = 5;
const TOKENS_PER_DOMAIN = 2;
const TOKEN_LEASE_DURATION_SEC = 5;
const POLL_DELAY_MS = 1000;

class ScrapeRecorder {
  private browser: Promise<playwright.Browser>;
  private stateDir: string;
  private db: YakatakDb;
  private workerId: string;
  private active: Set<Promise<void>> = new Set();
  public draining = false;

  private constructor(dbPath: string) {
    this.stateDir = path.resolve(path.dirname(dbPath), "scrape");
    this.db = new YakatakDb(dbPath);
    this.browser = playwright.chromium.launch();
    this.workerId = `scrape:${os.hostname()}:${process.pid}`;
  }

  static async new(dbPath: string) {
    const recorder = new ScrapeRecorder(dbPath);
    await recorder.db.init();
    return recorder;
  }

  async [Symbol.asyncDispose]() {
    this.db.close();
    await (await this.browser).close();
  }

  private async scrape(url: string, dir: string) {
    console.info(`Scraping ${url} to ${dir}`);

    const screenshotPath = path.join(dir, "w1024.png");
    const harPath = path.join(dir, "har.zip");

    const recordHar = { path: harPath };
    const viewport = { width: 1024, height: 768 };
    const browser = await this.browser;
    const context = await browser.newContext({ viewport, recordHar });

    const page = await context.newPage();
    await page.goto(url);

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const title = await page.title();
    await context.close();

    return { title, screenshotPath, harPath };
  }

  async run({ oneshot }: { oneshot: boolean }) {
    console.info(`Starting scrape worker ${this.workerId}`);

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

      const promise = (async () => {
        const timestamp = new Date().toISOString();
        const dir = path.join(this.stateDir, "" + job.id);

        if (!job.url) throw new Error(`Card ${job.cardId} has no URL`);

        const { title, screenshotPath, harPath } = await this.scrape(job.url, dir);

        const metadata = {
          crawled_at: timestamp,
          worker: this.workerId,
        };

        // TODO remove compatibility output
        await fs.writeFile(`${dir}/meta.json`, JSON.stringify({ url: job.url }));

        this.db.completeCollectJob(job.id, title, screenshotPath, harPath, metadata);
      })();
      promise
        .catch((e) => {
          console.error("Scrape failed:", e);
          process.exitCode = 1;
        })
        .finally(() => this.active.delete(promise));
      this.active.add(promise);
    }

    await Promise.allSettled(this.active);
  }
}

async function main() {
  const [, scriptPath, mode, dbPath, ...extraArgs] = process.argv;
  if ((mode !== "--oneshot" && mode !== "--daemon") || !dbPath || extraArgs.length > 0) {
    console.error(`Usage: npx tsx ${scriptPath} (--oneshot|--daemon) <database-path>`);
    process.exit(1);
  }

  await using recorder = await ScrapeRecorder.new(dbPath);

  function handleShutdown(signal: string) {
    if (recorder.draining) {
      console.info("Forcefully shutting down...");
      process.exit(1);
    }
    console.info("Gracefully shutting down...");
    recorder.draining = true;
  }

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));

  await recorder.run({ oneshot: mode === "--oneshot" });
}

await main();
