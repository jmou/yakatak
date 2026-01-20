export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);

  const id = parseInt(getRouterParam(event, "id")!);
  const workspace = db.getWorkspace(id);

  if (!workspace) {
    throw createError({
      statusCode: 404,
      statusMessage: "Workspace not found",
    });
  }

  return workspace;
});
