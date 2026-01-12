import type { BrowserContextProxy } from "../browser.ts";

export async function* collectPage(context: BrowserContextProxy, url: string) {
  const page = await context.launchPage(url);
  yield context.captureFullPage({ type: "page", url }, page);
}
