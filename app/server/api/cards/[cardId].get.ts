export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const db = await getDb(config.dbPath);
  const params = getRouterParams(event);
  const cardId = parseInt(params.cardId!, 10);

  const stmt = db["db"].prepare<[number], CardData>(`
    SELECT
      card.id,
      card.url,
      detail.title,
      COUNT(tile.id) AS numTiles
    FROM card
    LEFT JOIN detail ON detail.id = (
      SELECT id FROM detail
      WHERE card_id = card.id
      ORDER BY id DESC
      LIMIT 1
    )
    LEFT JOIN tile ON tile.detail_id = detail.id
    WHERE card.id = ?
    GROUP BY card.id
  `);

  const card = stmt.get(cardId);

  if (!card) {
    throw createError({
      statusCode: 404,
      statusMessage: "Card not found",
    });
  }

  return card;
});
