import { initContract } from "@ts-rest/core";
import { CardData } from "./common";

const c = initContract();

export const contract = c.router(
  {
    getDeck: {
      method: "GET",
      path: "/deck",
      responses: {
        200: c.type<{ deck: CardData[] }>(),
      },
    },
    getScrapeThumb: {
      method: "GET",
      path: "/scrapes/:scrapeId/thumb",
      responses: {
        200: c.otherResponse({
          contentType: "image/png",
          body: c.type<Blob>(),
        }),
      },
    },
    getScrapeTile: {
      method: "GET",
      path: "/scrapes/:scrapeId/tiles/:tileIndex",
      responses: {
        200: c.otherResponse({
          contentType: "image/png",
          body: c.type<Blob>(),
        }),
      },
    },
    listSnapshots: {
      method: "GET",
      path: "/snapshots",
      responses: {
        200: c.type<{ snapshots: string[] }>(),
      },
    },
    createSnapshot: {
      method: "POST",
      path: "/snapshots",
      body: c.type<any>(),
      responses: {
        200: c.type<{ id: string }>(),
      },
    },
    getSnapshot: {
      method: "GET",
      path: "/snapshots/:snapshotId",
      responses: {
        200: c.type<any>(),
      },
    },
  },
  {
    pathPrefix: "/api",
  }
);
