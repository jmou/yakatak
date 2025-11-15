interface PostRevisionBody {
  card_ids?: number[];
  urls?: string[];
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const params = getRouterParams(event);
  const deckId = parseInt(params.deckId!, 10);

  const body = await readBody<PostRevisionBody>(event);
  const cardIds = body.card_ids ?? body.urls!.map((url) => db.enqueueCard(url));

  const revision = db.createRevision(deckId, cardIds);
  return { id: revision.id };
});
