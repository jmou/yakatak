import type { EventHandlerRequest } from "h3";

export default defineEventHandler<EventHandlerRequest, Promise<Card[]>>(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);

  const cards = db.getAllCards();

  return cards.map((card) => ({
    id: card.id.toString(),
    url: card.url ?? "",
    title: card.title ?? "(unknown)",
    numTiles: card.numTiles,
  }));
});
