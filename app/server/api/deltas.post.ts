interface Delta {
  deckId: number;
  revisionId: number;
  position: number;
  oldPosition?: number;
  cardId?: number;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const body = await readBody<Delta>(event);

  db.appendDelta(
    body.deckId,
    body.revisionId,
    body.position,
    body.oldPosition ?? null,
    body.cardId ?? null,
  );
});
