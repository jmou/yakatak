export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);

  const workspaceId = parseInt(getRouterParam(event, "id")!);
  const body = await readBody<{ command: unknown[] }>(event);

  const operation = db.createOperation(workspaceId, body.command);
  return operation;
});
