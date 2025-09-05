import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
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
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.browser = playwright.chromium.launch();
  }

  async [Symbol.asyncDispose]() {
    await (await this.browser).close();
  }

  async scrape(url: string) {
    const hash = createHash("SHA1").update(url).digest("hex");
    const timestamp = new Date().toISOString();
    const dir = `${this.baseDir}/${hash}-${timestamp.replace(/[-:]/g, "")}`;

    console.info(`Scraping ${url} to ${dir}`);

    const recordHar = { path: `${dir}/har.zip` };
    const viewport = { width: 1024, height: 768 };
    const browser = await this.browser;
    const context = await browser.newContext({ viewport, recordHar });

    const page = await context.newPage();
    await page.goto(url);

    await page.screenshot({ path: `${dir}/w1024.png`, fullPage: true });

    await context.close();

    const meta = { url, timestamp, hostname: os.hostname() };
    await fs.writeFile(`${dir}/meta.json`, JSON.stringify(meta));
  }
}

async function main() {
  await using recorder = new ScrapeRecorder("state/scrape");
  for (const outcome of await Promise.allSettled(
    process.argv.slice(2).map((url) => recorder.scrape(url)),
  )) {
    if (outcome.status === "rejected") {
      console.error(`Failed to scrape: ${outcome.reason}`);
      process.exitCode = 1;
    }
  }
}

await main();
