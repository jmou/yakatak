export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const body = await readBody(event);
  const { url } = body;

  if (!url || typeof url !== "string") {
    throw createError({
      statusCode: 400,
      statusMessage: "URL is required",
    });
  }

  const cardId = db.enqueueCard(url);

  return { id: cardId };
});
