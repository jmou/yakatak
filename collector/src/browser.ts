import type { Browser, BrowserContext, ElementHandle, Page } from "playwright";
import { chromium } from "playwright";

export interface CaptureDetail {
  cardKey: {};
  url: string;
  title: string;
  image: Buffer;
  metadata: any;
}

const VIEWPORT = { width: 1024, height: 768 };

export async function createBrowserProxy() {
  const browser = await chromium.launch({ headless: false });
  return new BrowserProxy(browser);
}

export class BrowserProxy {
  protected browser: Browser;

  constructor(browser: Browser) {
    this.browser = browser;
  }

  async [Symbol.asyncDispose]() {
    await this.browser.close();
  }

  async newContext(harPath?: string) {
    const recordHar = harPath == undefined ? undefined : { path: harPath };
    const context = await this.browser.newContext({ viewport: VIEWPORT, recordHar });
    return new BrowserContextProxy(context, harPath);
  }
}

export class BrowserContextProxy {
  protected context: BrowserContext;
  public readonly harPath: string | undefined;

  constructor(context: BrowserContext, harPath: string | undefined) {
    this.context = context;
    this.harPath = harPath;
  }

  async [Symbol.asyncDispose]() {
    await this.close();
  }

  async close() {
    await this.context.close();
  }

  async launchPage(url: string): Promise<Page> {
    const page = await this.context.newPage();
    await page.goto(url);
    return page;
  }

  async captureFullPage(cardKey: {}, page: Page): Promise<CaptureDetail> {
    const url = page.url();
    const title = await page.title();
    const image = await page.screenshot({ fullPage: true });
    const metadata = { url, title };
    return { cardKey, url, title, image, metadata };
  }

  async captureElement(
    cardKey: {},
    elem: ElementHandle,
    options: { url: string; title: string; style?: string; metadata: any },
  ): Promise<CaptureDetail> {
    const { url, title, style, metadata } = options;
    let lastError;
    for (let retry = 1; retry <= 5; retry++) {
      try {
        const image = await elem.screenshot({ style, timeout: 10_000 });
        return { cardKey, url, title, image, metadata };
      } catch (error) {
        lastError = error;
        console.warn(`Screenshot attempt ${retry} failed, retrying...`);
      }
    }
    throw lastError;
  }
}

export async function createCDPBrowserProxy(cdpUrl: string) {
  const browser = await chromium.connectOverCDP(cdpUrl);
  return new CDPBrowserProxy(browser);
}

export class CDPBrowserProxy extends BrowserProxy {
  override async newContext() {
    const context = this.browser.contexts()[0];
    if (!context) throw new Error("Expected default browser context");
    // HAR not supported for CDP.
    return new CDPBrowserContextProxy(context, undefined);
  }
}

class CDPBrowserContextProxy extends BrowserContextProxy {
  override async launchPage(url: string): Promise<Page> {
    const pages = this.context.pages();

    // Reuse an existing open page.
    for (const page of pages) {
      if (page.url() === url) return page;
    }

    // A bit of a dance to open a new window.
    if (!pages[0]) throw new Error("Expected existing page");
    const client = await this.context.newCDPSession(pages[0]);
    const [page] = await Promise.all([
      this.context.waitForEvent("page"),
      client.send("Target.createTarget", { url, newWindow: true }),
    ]);
    await client.detach();
    await page.waitForLoadState();
    await page.setViewportSize(VIEWPORT);
    return page;
  }
}
