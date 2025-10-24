export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const params = getRouterParams(event);
  const deckId = parseInt(params.deckId!, 10);
  const revisionId = parseInt(params.revisionId!, 10);
  const query = getQuery(event);
  let sinceDeltaId = typeof query.since === "string" ? parseInt(query.since, 10) : 0;

  setResponseHeader(event, "Content-Type", "text/event-stream");
  const stream = createEventStream(event);

  const handle = setInterval(() => {
    const deltas = db.getDeltas(deckId, revisionId, sinceDeltaId);
    for (const { id, position, oldPosition, url } of deltas) {
      const msg = {
        id,
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
