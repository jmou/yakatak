/** biome-ignore-all lint/suspicious/noExplicitAny: avoid platformContext type inference */
import { fetchRequestHandler, tsr } from "@ts-rest/serverless/fetch";
import type { Get, UniversalHandler } from "@universal-middleware/core";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contract } from "../lib/contract.ts";

const stateDir = join(process.cwd(), "../state");

const router = tsr.platformContext<{}>().router(contract, {
  getDeck: async () => {
    const path = join(stateDir, "deck.json");
    const data = await readFile(path);
    const body = JSON.parse(data.toString());
    return { status: 200, body };
  },

  getScrapeThumb: async ({ params }) => {
    const path = join(stateDir, "scrape", params.scrapeId, "derived", "thumb.png");
    const data = await readFile(path);
    const body = new Blob([new Uint8Array(data)], { type: "image/png" });
    return { status: 200, body };
  },

  getScrapeTile: async ({ params }) => {
    const path = join(
      stateDir,
      "scrape",
      params.scrapeId,
      "derived",
      "tiles",
      `${params.tileIndex}.png`,
    );
    const data = await readFile(path);
    const body = new Blob([new Uint8Array(data)], { type: "image/png" });
    return { status: 200, body };
  },

  listSnapshots: async () => {
    const dir = join(stateDir, "snapshots");
    const files = await readdir(dir);
    const snapshots = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.replace(".json", ""))
      .sort()
      .reverse();
    return { status: 200, body: { snapshots } };
  },

  createSnapshot: async ({ body }) => {
    const snapshotId = new Date().toISOString().replaceAll(/[-:]|\.\d+/g, "");
    const path = join(stateDir, "snapshots", `${snapshotId}.json`);
    await writeFile(path, JSON.stringify(body));
    return { status: 200, body: { id: snapshotId } };
  },

  getSnapshot: async ({ params }) => {
    const path = join(stateDir, "snapshots", `${params.snapshotId}.json`);
    const data = await readFile(path);
    const body = JSON.parse(data.toString());
    return { status: 200, body };
  },
});

export const apiHandler: Get<[], UniversalHandler> = () => async (request, ctx, runtime) => {
  const response = await fetchRequestHandler({
    request: new Request(request.url, request),
    contract,
    router,
    options: {},
    platformContext: {
      ...ctx,
      ...runtime,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });

  if (response) {
    response.headers.set("Cache-Control", "no-cache");
  }

  return response;
};
