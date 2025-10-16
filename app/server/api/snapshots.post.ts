export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const body = await readBody<Snapshot>(event);
  db.saveSnapshot(body);
});
