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

class ScrapeRecorder {
  private browser: Promise<playwright.Browser>;
  private stateDir: string;
  private db: YakatakDb;
  private workerId: string;

  // Daemon configuration
  private maxConcurrency: number = 5;
  private maxTokensPerDomain: number = 2;
  private leaseDurationSec: number = 5;

  // Tracking state
  private activeScrapes: Set<Promise<void>> = new Set();

  private constructor(dbPath: string, stateDir: string) {
    this.stateDir = stateDir;
    this.db = new YakatakDb(dbPath);
    this.browser = playwright.chromium.launch();
    this.workerId = `scrape:${os.hostname()}:${process.pid}`;
  }

  static async new(dbPath: string, stateDir: string) {
    const recorder = new ScrapeRecorder(dbPath, stateDir);
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

  async run() {
    console.info(`Starting scrape worker (worker: ${this.workerId})`);
    console.info(`  Max concurrency: ${this.maxConcurrency}`);
    console.info(`  Max tokens per domain: ${this.maxTokensPerDomain}`);
    console.info(`  Token lease duration: ${this.leaseDurationSec}s`);

    while (true) {
      // Only try to claim jobs if we have capacity
      if (this.activeScrapes.size < this.maxConcurrency) {
        const job = this.db.claimCollectJobWithLease(this.workerId, this.maxTokensPerDomain);

        if (job) {
          if (!job.url) {
            console.error(`Card ${job.cardId} has no URL, skipping`);
            continue;
          }

          // Acquire token lease just before crawling
          if (job.domain) {
            this.db.acquireTokenLease(job.domain, this.workerId, this.leaseDurationSec);
          }

          // Start processing the job asynchronously
          const scrapePromise = (async () => {
            try {
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
              // Failed jobs remain claimed and need manual intervention
            }
          })();

          this.activeScrapes.add(scrapePromise);

          // Remove from active set when done
          scrapePromise.finally(() => {
            this.activeScrapes.delete(scrapePromise);
          });
        } else {
          // No jobs available
          if (this.activeScrapes.size === 0) {
            // No active scrapes and no jobs available - we're done
            console.info("No more jobs available, exiting");
            break;
          }
          // Wait a bit before polling again
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } else {
        // At max concurrency, wait a bit
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Wait for any remaining active scrapes to complete
    await Promise.allSettled(Array.from(this.activeScrapes));
  }
}

async function main() {
  const [, , dbPath, stateDir] = process.argv;

  if (!dbPath || !stateDir) {
    console.error("Usage: npx tsx scrape/src/scrape.ts <database-path> <state-directory>");
    process.exit(1);
  }

  await using recorder = await ScrapeRecorder.new(dbPath, stateDir);
  await recorder.run();
}

await main();
