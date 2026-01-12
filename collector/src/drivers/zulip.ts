import type { BrowserContextProxy } from "../browser.ts";

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

export async function* collectZulip(context: BrowserContextProxy, url: string) {
  const page = await context.launchPage(url);

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
    const metadata = { url, stream, topic, messageIds, dateText };

    console.log(
      `Collecting messages ${messageIds.join(", ")} from ${stream}${topic ? " > " + topic : ""}`,
    );

    visitedMessageIds.push(...messageIds);

    const cardKey = { type: "zulip", messageIds };
    const title = `${stream}${topic ? " > " + topic : ""}`;
    const style = "#compose { display: none; }";
    yield await context.captureElement(cardKey, row, { url, title, style, metadata });
  }
}
