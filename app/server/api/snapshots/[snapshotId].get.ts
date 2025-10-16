export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const params = getRouterParams(event);
  const snapshotId = parseInt(params.snapshotId!, 10);

  const snapshot = db.getSnapshot(snapshotId);
  if (!snapshot) {
    throw createError({
      statusCode: 404,
      statusMessage: "Snapshot not found",
    });
  }

  return snapshot as Snapshot;
});
