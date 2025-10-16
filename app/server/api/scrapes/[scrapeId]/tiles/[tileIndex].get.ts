import fs from "node:fs";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const params = getRouterParams(event);
  const cardId = parseInt(params.scrapeId!, 10);
  const tileIndex = parseInt(params.tileIndex!, 10);

  const filePath = db.getTilePath(cardId, tileIndex);
  if (!filePath) {
    throw createError({
      statusCode: 404,
      statusMessage: "Tile not found",
    });
  }

  setResponseHeader(event, "Content-Type", "image/png");
  return sendStream(event, fs.createReadStream(filePath));
});
