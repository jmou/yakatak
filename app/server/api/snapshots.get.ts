export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const snapshots = db.listSnapshots();
  return { snapshots };
});
