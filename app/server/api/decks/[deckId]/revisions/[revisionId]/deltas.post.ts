interface Delta {
  position: number;
  oldPosition?: number;
  cardId?: number;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const params = getRouterParams(event);
  const deckId = parseInt(params.deckId!, 10);
  const revisionId = parseInt(params.revisionId!, 10);
  const body = await readBody<Delta>(event);

  db.appendDelta(deckId, revisionId, body.position, body.oldPosition ?? null, body.cardId ?? null);
});
