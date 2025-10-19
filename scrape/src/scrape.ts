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

  // TODO poll with semaphore
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
        const url = job.source.url;

        const { title, screenshotPath, harPath } = await this.scrape(url, dir);

        const metadata = {
          crawled_at: timestamp,
          worker: this.workerId,
        };

        // TODO remove compatibility output
        await fs.writeFile(`${dir}/meta.json`, JSON.stringify({ url }));

        this.db.completeCollectJob(
          job.id,
          job.source,
          url,
          title,
          screenshotPath,
          harPath,
          metadata
        );
      })
    )) {
      if (outcome.status === "rejected") {
        console.error(`Failed to scrape: ${outcome.reason}`);
        process.exitCode = 1;
      }
    }
  }
}

async function main() {
  const [, scriptPath, dbPath, stateDir, ...extraArgs] = process.argv;
  if (!dbPath || !stateDir || extraArgs.length > 0) {
    console.error(
      `Usage: node ${scriptPath} <database-path> <state-directory>`
    );
    process.exit(1);
  }

  await using recorder = await ScrapeRecorder.new(dbPath, stateDir);
  await recorder.scrapeAll();
}

await main();
