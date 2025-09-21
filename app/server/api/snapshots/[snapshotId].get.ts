import fs from "node:fs/promises";
import path from "node:path";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const params = getRouterParams(event);
  const filePath = path.join(config.stateDir, "snapshots", `${params.snapshotId}.json`);
  const data = await fs.readFile(filePath);
  return JSON.parse(data.toString()) as Snapshot;
});
