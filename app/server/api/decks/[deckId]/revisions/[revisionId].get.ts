export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const params = getRouterParams(event);
  const deckId = parseInt(params.deckId!, 10);
  const revisionId = params.revisionId === "latest" ? undefined : parseInt(params.revisionId!, 10);

  const revision = db.getRevision(deckId, revisionId);
  if (!revision) {
    throw createError({
      statusCode: 404,
      statusMessage: "Deck revision not found",
    });
  }

  return revision;
});
