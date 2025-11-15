export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);

  const decks = db.listDecks();
  return { decks };
});
