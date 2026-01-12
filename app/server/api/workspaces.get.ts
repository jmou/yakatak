export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);

  let workspace = db.getMostRecentWorkspace();
  if (!workspace) {
    workspace = db.createWorkspace();
  }

  return workspace;
});
