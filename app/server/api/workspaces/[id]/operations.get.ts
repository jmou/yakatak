export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);

  const workspaceId = parseInt(getRouterParam(event, "id")!);
  const operations = db.getOperations(workspaceId);

  return { operations };
});
