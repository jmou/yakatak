export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const query = getQuery(event);
  let sinceDeltaId = typeof query.since === "string" ? parseInt(query.since, 10) : 0;

  const decks: { deckId: number; revisionId: number }[] = [];
  if (typeof query.decks === "string") {
    for (const piece of query.decks.split(",")) {
      const match = piece.match(/(\d+)@(\d+)/);
      if (!match) throw createError({ statusCode: 400, statusMessage: "decks parameter invalid" });
      const deckId = parseInt(match[1]!, 10);
      const revisionId = parseInt(match[2]!, 10);
      decks.push({ deckId, revisionId });
    }
  }

  setResponseHeader(event, "Content-Type", "text/event-stream");
  const stream = createEventStream(event);

  const handle = setInterval(() => {
    const deltas = db.getDeltas(decks, sinceDeltaId);
    for (const { id, deckId, revisionId, position, oldPosition, url } of deltas) {
      const msg = {
        id,
        deckId,
        revisionId,
        type: url == null ? "delete" : oldPosition == null ? "insert" : "move",
        position,
        oldPosition: oldPosition ?? undefined,
        url: url ?? undefined,
      };
      stream.push(JSON.stringify(msg));
      sinceDeltaId = id + 1;
    }
  }, 2_000);

  stream.onClosed(() => clearInterval(handle));

  return stream.send();
});
