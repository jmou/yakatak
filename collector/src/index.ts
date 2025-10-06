import * as fs from "node:fs/promises";
import * as os from "node:os";
import { chromium, type Page } from "playwright";

async function launchPage(cdpUrl: string | undefined, url: string) {
  if (cdpUrl) {
    const browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0];
    if (!context) throw new Error("Expected default browser context");
    const pages = context.pages();

    // Reuse an existing open page.
    for (const page of pages) {
      if (page.url() === url) return { browser, context, page };
    }

    // A bit of a dance to open a new window.
    if (!pages[0]) throw new Error("Expected existing page");
    const client = await context.newCDPSession(pages[0]);
    console.info("Connected to remote CDP");
    const [page] = await Promise.all([
      context.waitForEvent("page"),
      client.send("Target.createTarget", { url, newWindow: true }),
    ]);
    await client.detach();
    await page.waitForLoadState();

    return { browser, context, page };
  } else {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url);
    return { browser, context, page };
  }
}

function extractRecipientRowMeta(rowElem: HTMLElement) {
  const links = rowElem.querySelectorAll<HTMLAnchorElement>(".message_header a");
  const url = links[links.length - 1]?.href;
  if (!url) throw new Error("Expected message url");

  const streamElem = rowElem.querySelector(".stream_label");
  const stream = streamElem?.textContent?.replaceAll(/\s+/g, " ")?.trim();
  const topic = rowElem.querySelector(".stream_topic")?.textContent?.trim();

  const messageIds = [...rowElem.querySelectorAll(".message_row")].map((el) =>
    parseInt(el.getAttribute("data-message-id")!, 10),
  );

  const dateText = rowElem.querySelector(".recipient_row_date")?.textContent;

  return { url, stream, topic, messageIds, dateText };
}

async function main() {
  const outDir = process.argv[2];
  const cdpUrl = process.argv[3];
  if (!outDir) throw new Error("usage: tsx index.ts <output-dir> [cdp-url]");
  await fs.mkdir(outDir, { recursive: true });

  const zulipUrl = "https://recurse.zulipchat.com/#narrow/is/starred";
  const { browser, page } = await launchPage(cdpUrl, zulipUrl);
  page.setViewportSize({ width: 1024, height: 768 });

  const visitedMessageIds: number[] = [];
  while (true) {
    // Get the recipient row with the last unvisited message.
    const row = (
      await page.evaluateHandle((visitedMessageIds) => {
        const msgs = [...document.querySelectorAll<HTMLElement>(".message_row")].filter(
          (elem) => !visitedMessageIds.includes(parseInt(elem.dataset.messageId!, 10)),
        );
        return msgs[msgs.length - 1]?.closest(".recipient_row");
      }, visitedMessageIds)
    ).asElement();
    if (!row) break;

    row.evaluate((elem: HTMLElement) =>
      elem.querySelector<HTMLElement>("button.message_expander")?.click(),
    );

    const { url, stream, topic, messageIds, dateText } =
      await row.evaluate(extractRecipientRowMeta);
    const scrapedAt = new Date().toISOString();
    const hostname = os.hostname();
    const meta = { url, stream, topic, messageIds, dateText, scrapedAt, hostname };

    console.log(
      `Collecting messages ${messageIds.join(", ")} from ${stream}${topic ? " > " + topic : ""}`,
    );

    const dir = `${outDir}/${messageIds.map((id) => "" + id).join("-")}-${scrapedAt.replace(/[-:]/g, "")}`;
    await fs.mkdir(dir);
    await fs.writeFile(`${dir}/meta.json`, JSON.stringify(meta));

    for (let retry = 1; retry <= 5; retry++) {
      try {
        const style = "#compose { display: none; }";
        await row.screenshot({ path: `${dir}/detail.png`, style, timeout: 10_000 });
        break;
      } catch (error) {
        if (retry === 5) throw error;
        console.warn(`Screenshot attempt ${retry} failed, retrying...`);
      }
    }

    visitedMessageIds.push(...messageIds);
  }

  await browser.close();
}

await main();
