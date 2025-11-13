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
  private domainDelayMs: number = 5000; // 5 seconds between scrapes to same domain

  // Tracking state
  private activeScrapes: Set<Promise<void>> = new Set();
  private domainLastScrape: Map<string, number> = new Map();

  private constructor(dbPath: string, stateDir: string, maxConcurrency?: number, domainDelayMs?: number) {
    this.stateDir = stateDir;
    this.db = new YakatakDb(dbPath);
    this.browser = playwright.chromium.launch();
    this.workerId = `scrape:${os.hostname()}:${process.pid}`;

    if (maxConcurrency !== undefined) this.maxConcurrency = maxConcurrency;
    if (domainDelayMs !== undefined) this.domainDelayMs = domainDelayMs;
  }

  static async new(dbPath: string, stateDir: string, maxConcurrency?: number, domainDelayMs?: number) {
    const recorder = new ScrapeRecorder(dbPath, stateDir, maxConcurrency, domainDelayMs);
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

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      // If URL parsing fails, return the URL itself as a fallback
      return url;
    }
  }

  private async processJob(job: { id: number; cardId: number; url: string | null }, domain: string): Promise<void> {
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
      this.db.unclaimCollectJob(job.id);
    }
  }

  async runDaemon() {
    console.info(`Starting scrape daemon (worker: ${this.workerId})`);
    console.info(`  Max concurrency: ${this.maxConcurrency}`);
    console.info(`  Domain delay: ${this.domainDelayMs}ms`);

    while (true) {
      // Only try to claim jobs if we have capacity
      if (this.activeScrapes.size < this.maxConcurrency) {
        const job = this.db.claimCollectJob(this.workerId);

        if (job && job.url) {
          const domain = this.extractDomain(job.url);
          const now = Date.now();
          const lastScrape = this.domainLastScrape.get(domain) || 0;
          const timeSinceLastScrape = now - lastScrape;

          if (timeSinceLastScrape < this.domainDelayMs) {
            // Need to wait for domain rate limit
            // Release job back to queue and try again later
            this.db.unclaimCollectJob(job.id);
            await sleep(100); // Brief pause before retrying
            continue;
          }

          // Update domain last scrape time
          this.domainLastScrape.set(domain, now);

          // Start processing the job asynchronously
          const scrapePromise = this.processJob(job, domain);
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
  let domainDelayMs: number | undefined;

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
    } else if (arg === "--domain-delay" || arg === "-D") {
      domainDelayMs = parseInt(args[++i], 10);
      if (isNaN(domainDelayMs) || domainDelayMs < 0) {
        console.error("Error: --domain-delay must be a non-negative integer (milliseconds)");
        process.exit(1);
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npx tsx scrape/src/scrape.ts [options] <database-path> <state-directory>

Options:
  -d, --daemon              Run as a long-running daemon (default: one-shot mode)
  -c, --concurrency <n>     Max concurrent scrapes (default: 5)
  -D, --domain-delay <ms>   Min delay between scrapes to same domain in ms (default: 5000)
  -h, --help                Show this help message

Examples:
  # One-shot mode (legacy behavior)
  npx tsx scrape/src/scrape.ts state/db.sqlite3 state/scrape

  # Daemon mode with defaults
  npx tsx scrape/src/scrape.ts --daemon state/db.sqlite3 state/scrape

  # Daemon with custom settings
  npx tsx scrape/src/scrape.ts -d -c 10 -D 3000 state/db.sqlite3 state/scrape
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

  await using recorder = await ScrapeRecorder.new(dbPath, stateDir, maxConcurrency, domainDelayMs);

  if (daemon) {
    await recorder.runDaemon();
  } else {
    await recorder.scrapeAll();
  }
}

await main();
