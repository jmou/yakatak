import fs from "node:fs/promises";
import path from "node:path";

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const dir = path.join(config.stateDir, "snapshots");
  const files = await fs.readdir(dir);
  const snapshots = files
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(".json", ""))
    .sort()
    .reverse();
  return { snapshots };
});
