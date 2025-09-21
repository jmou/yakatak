import fs from "node:fs/promises";
import path from "node:path";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const snapshotId = new Date().toISOString().replaceAll(/[-:]|\.\d+/g, "");
  const filePath = path.join(config.stateDir, "snapshots", `${snapshotId}.json`);
  const body = await readBody<Snapshot>(event);
  await fs.writeFile(filePath, JSON.stringify(body));
  return { id: snapshotId };
});
