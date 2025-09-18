import fs from "node:fs";
import path from "node:path";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const params = getRouterParams(event);
  const filePath = path.join(config.stateDir, "scrape", params.scrapeId, "derived", "thumb.png");
  setResponseHeader(event, "Content-Type", "image/png");
  return sendStream(event, fs.createReadStream(filePath));
});
