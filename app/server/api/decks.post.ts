export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);

  return db.createDeck();
});
