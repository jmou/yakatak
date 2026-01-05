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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ScrapeRecorder {
  private browser: Promise<playwright.Browser>;
  private stateDir: string;
  private db: YakatakDb;
  private workerId: string;

  // Daemon configuration
  private maxConcurrency: number = 5;
  private maxTokensPerDomain: number = 2; // Max concurrent scrapes per domain
  private leaseDurationSec: number = 5; // Token lease duration in seconds

  // Tracking state
  private activeScrapes: Set<Promise<void>> = new Set();

  private constructor(
    dbPath: string,
    stateDir: string,
    maxConcurrency?: number,
    maxTokensPerDomain?: number,
    leaseDurationSec?: number,
  ) {
    this.stateDir = stateDir;
    this.db = new YakatakDb(dbPath);
    this.browser = playwright.chromium.launch();
    this.workerId = `scrape:${os.hostname()}:${process.pid}`;

    if (maxConcurrency !== undefined) this.maxConcurrency = maxConcurrency;
    if (maxTokensPerDomain !== undefined) this.maxTokensPerDomain = maxTokensPerDomain;
    if (leaseDurationSec !== undefined) this.leaseDurationSec = leaseDurationSec;
  }

  static async new(
    dbPath: string,
    stateDir: string,
    maxConcurrency?: number,
    maxTokensPerDomain?: number,
    leaseDurationSec?: number,
  ) {
    const recorder = new ScrapeRecorder(dbPath, stateDir, maxConcurrency, maxTokensPerDomain, leaseDurationSec);
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

  private async processJob(job: { id: number; cardId: number; url: string | null }): Promise<void> {
    try {
      if (!job.url) {
        throw new Error(`Card ${job.cardId} has no URL`);
      }

      const timestamp = new Date().toISOString();
      const dir = path.join(this.stateDir, "" + job.id);

      console.info(`[${this.activeScrapes.size}/${this.maxConcurrency}] Scraping ${job.url}`);

      const { title, screenshotPath, harPath } = await this.scrape(job.url, dir);

      const metadata = {
        crawled_at: timestamp,
        worker: this.workerId,
      };

      // TODO remove compatibility output
      await fs.writeFile(`${dir}/meta.json`, JSON.stringify({ url: job.url }));

      this.db.completeCollectJob(job.id, title, screenshotPath, harPath, metadata);
      console.info(`✓ Completed ${job.url}`);
    } catch (error) {
      console.error(`✗ Failed to scrape ${job.url}:`, error);
      // Release job back to queue so another worker can try
      this.db.releaseTokenLease(job.id);
      this.db.unclaimCollectJob(job.id);
    }
  }

  async runDaemon() {
    console.info(`Starting scrape daemon (worker: ${this.workerId})`);
    console.info(`  Max concurrency: ${this.maxConcurrency}`);
    console.info(`  Max tokens per domain: ${this.maxTokensPerDomain}`);
    console.info(`  Token lease duration: ${this.leaseDurationSec}s`);

    while (true) {
      // Only try to claim jobs if we have capacity
      if (this.activeScrapes.size < this.maxConcurrency) {
        const job = this.db.claimCollectJobWithLease(
          this.workerId,
          this.maxTokensPerDomain,
          this.leaseDurationSec,
        );

        if (job) {
          // Start processing the job asynchronously
          const scrapePromise = this.processJob(job);
          this.activeScrapes.add(scrapePromise);

          // Remove from active set when done
          scrapePromise.finally(() => {
            this.activeScrapes.delete(scrapePromise);
          });
        } else {
          // No jobs available, wait before polling again
          await sleep(1000);
        }
      } else {
        // At max concurrency, wait a bit
        await sleep(100);
      }
    }
  }

  // Legacy method for backward compatibility - runs daemon once then exits
  async scrapeAll() {
    const jobs = [];
    while (true) {
      const job = this.db.claimCollectJob(this.workerId);
      if (!job) break;
      jobs.push(job);
    }

    for (const outcome of await Promise.allSettled(
      jobs.map(async (job) => {
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
      }),
    )) {
      if (outcome.status === "rejected") {
        console.error(`Failed to scrape: ${outcome.reason}`);
        process.exitCode = 1;
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let dbPath: string | undefined;
  let stateDir: string | undefined;
  let daemon = false;
  let maxConcurrency: number | undefined;
  let maxTokensPerDomain: number | undefined;
  let leaseDurationSec: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--daemon" || arg === "-d") {
      daemon = true;
    } else if (arg === "--concurrency" || arg === "-c") {
      maxConcurrency = parseInt(args[++i], 10);
      if (isNaN(maxConcurrency) || maxConcurrency < 1) {
        console.error("Error: --concurrency must be a positive integer");
        process.exit(1);
      }
    } else if (arg === "--tokens-per-domain" || arg === "-t") {
      maxTokensPerDomain = parseInt(args[++i], 10);
      if (isNaN(maxTokensPerDomain) || maxTokensPerDomain < 1) {
        console.error("Error: --tokens-per-domain must be a positive integer");
        process.exit(1);
      }
    } else if (arg === "--lease-duration" || arg === "-l") {
      leaseDurationSec = parseInt(args[++i], 10);
      if (isNaN(leaseDurationSec) || leaseDurationSec < 1) {
        console.error("Error: --lease-duration must be a positive integer (seconds)");
        process.exit(1);
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npx tsx scrape/src/scrape.ts [options] <database-path> <state-directory>

Options:
  -d, --daemon                    Run as a long-running daemon (default: one-shot mode)
  -c, --concurrency <n>           Max concurrent scrapes (default: 5)
  -t, --tokens-per-domain <n>     Max concurrent scrapes per domain (default: 2)
  -l, --lease-duration <seconds>  Token lease duration in seconds (default: 5)
  -h, --help                      Show this help message

Examples:
  # One-shot mode (legacy behavior)
  npx tsx scrape/src/scrape.ts state/db.sqlite3 state/scrape

  # Daemon mode with defaults (5 concurrent, 2 per domain, 5s lease)
  npx tsx scrape/src/scrape.ts --daemon state/db.sqlite3 state/scrape

  # Daemon with custom settings
  npx tsx scrape/src/scrape.ts -d -c 10 -t 3 -l 10 state/db.sqlite3 state/scrape
`);
      process.exit(0);
    } else if (!dbPath) {
      dbPath = arg;
    } else if (!stateDir) {
      stateDir = arg;
    } else {
      console.error(`Error: Unexpected argument: ${arg}`);
      console.error(`Run with --help for usage information`);
      process.exit(1);
    }
  }

  if (!dbPath || !stateDir) {
    console.error("Error: Missing required arguments");
    console.error("Usage: npx tsx scrape/src/scrape.ts [options] <database-path> <state-directory>");
    console.error("Run with --help for more information");
    process.exit(1);
  }

  await using recorder = await ScrapeRecorder.new(
    dbPath,
    stateDir,
    maxConcurrency,
    maxTokensPerDomain,
    leaseDurationSec,
  );

  if (daemon) {
    await recorder.runDaemon();
  } else {
    await recorder.scrapeAll();
  }
}

await main();
