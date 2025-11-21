// Actions are user event handlers. They should not directly mutate workspace
// state, but they may return a Command to specify an operation on state.
//
// By convention we define action functions with => notation for easy currying.
// We generally annotate the UserActionFn type, which implies both the ctx
// argument and return types.

export const pickCard = (pileIndex: number, cardIndex: number) => (ctx: ActionContext) => {
  const pile = ctx.store.piles[pileIndex];
  if (!pile) return;
  pile.pickedCardIndex = Math.max(0, Math.min(cardIndex, pile.cards.length - 1));
};

export const pickCardLeft: UserActionFn = (ctx) => {
  pickCard(ctx.store.activePileIndex, ctx.store.activePile.pickedCardIndex - 1)(ctx);
};
export const pickCardRight: UserActionFn = (ctx) => {
  pickCard(ctx.store.activePileIndex, ctx.store.activePile.pickedCardIndex + 1)(ctx);
};
export const pickCardUp: UserActionFn = (ctx) => {
  ctx.store.decrementActivePileIndex();
};
export const pickCardDown: UserActionFn = (ctx) => {
  ctx.store.incrementActivePileIndex();
};
export const pickCardFirst: UserActionFn = (ctx) => {
  pickCard(ctx.store.activePileIndex, 0)(ctx);
};
export const pickCardLast: UserActionFn = (ctx) => {
  pickCard(ctx.store.activePileIndex, ctx.store.activePile.cards.length - 1)(ctx);
};

export const movePickedCardToPile =
  (pileIndex: number): UserActionFn =>
  (ctx) => {
    const pile = ctx.store.piles[pileIndex];
    if (!pile) return;
    const card = ctx.store.pickedCard;
    if (!card) return;

    let cardIndex = pile.cards.length;
    if (pileIndex === ctx.store.activePileIndex) cardIndex--;

    return ["moveCard", ctx.store.currentLocation, [pileIndex, cardIndex]];
  };

export const swapPickedCardLeft: UserActionFn = (ctx) => {
  if (!ctx.store.pickedCard) return;
  const source = ctx.store.currentLocation;
  if (source[1] <= 0) return;
  const target: CardLocation = [source[0], source[1] - 1];
  return ["moveCard", source, target, { followTarget: true }];
};

export const swapPickedCardRight: UserActionFn = (ctx) => {
  if (!ctx.store.pickedCard) return;
  const source = ctx.store.currentLocation;
  if (source[1] + 1 >= ctx.store.activePile.cards.length) return;
  const target: CardLocation = [source[0], source[1] + 1];
  return ["moveCard", source, target, { followTarget: true }];
};

export const swapPickedCardUp: UserActionFn = (ctx) => {
  if (ctx.store.activePileIndex <= PILE_START) return;
  return ["swapPiles", ctx.store.activePileIndex, ctx.store.decrementActivePileIndex()];
};

export const swapPickedCardDown: UserActionFn = (ctx) => {
  if (ctx.store.activePileIndex + 1 >= ctx.store.piles.length) return;
  return ["swapPiles", ctx.store.activePileIndex, ctx.store.incrementActivePileIndex()];
};

export const openPickedCardPage: UserActionFn = (ctx) => {
  if (ctx.store.pickedCard?.url != null) open(ctx.store.pickedCard.url);
};

export const goToChosenPile: UserActionFn = async (ctx) => {
  const options = ctx.store.piles
    .slice(PILE_START)
    .map((pile, i) => `${i + 1}. ${pile.name ?? "(unnamed)"}`);
  const position = await ctx.ask("Piles", options, ctx.store.activePileIndex - PILE_START);
  if (position == null) return;
  ctx.store.activePileIndex = PILE_START + position;
};

export const nameActivePile: UserActionFn = (ctx) => {
  const name = prompt("Pile name", ctx.store.activePile.name);
  if (name == null) return;
  return ["namePile", ctx.store.activePileIndex, name];
};

async function ensureSavedRevisionForPile(pile: Pile) {
  if (pile.revisionId != null) return;
  if (pile.cards.length === 0) return;

  if (pile.deckId == null) {
    const deck = await $fetch("/api/decks", { method: "POST" });
    // By design, the reverse operation retains this new deck association.
    pile.deckId = deck.id;
  }

  const pileId = checked(pile.deckId);
  const card_ids = pile.cards.map((card) => card.id);
  const revision = await $fetch(`/api/decks/${pileId}/revisions`, {
    method: "POST",
    body: { card_ids },
  });
  pile.revisionId = revision.id;
}

export const loadPileFromChosenDeck: UserActionFn = async (ctx) => {
  const { decks } = await $fetch("/api/decks");
  const excludeDeckIds = new Set(ctx.store.piles.map((pile) => pile.deckId));
  excludeDeckIds.delete(ctx.store.activePile.deckId);
  const candidateDecks = decks.filter((deck) => !excludeDeckIds.has(deck.id));
  const currentDeckIndex = candidateDecks.findIndex(
    (deck) => deck.id === ctx.store.activePile.deckId,
  );
  const deckId = await ctx.ask(
    "Select deck",
    candidateDecks.map((s) => `Deck ${s.id}`),
    currentDeckIndex < 0 ? 0 : currentDeckIndex,
    candidateDecks.map((s) => s.id),
  );
  if (deckId == null) return;

  ctx.setStatus("Loading...");
  await ensureSavedRevisionForPile(ctx.store.activePile);
  const revision = await $fetch(`/api/decks/${deckId}/revisions/latest`);
  ctx.revisionCache.set(revision.id, revision.cards);
  ctx.setStatus("Loaded", { transient: true });

  return ["loadDeck", ctx.store.activePileIndex, deckId, revision.id];
};

function serializeCard(card: Card) {
  const { id, url, title, numTiles } = card;
  return { id, url, title, numTiles };
}

function serializePile(pile: Pile) {
  const { name, pickedCardIndex } = pile;
  const cards = pile.cards.map(serializeCard);
  return { name, cards, pickedCardIndex };
}

export const takeSnapshot: UserActionFn = async (ctx) => {
  ctx.setStatus("Saving...");
  const { piles, activePileIndex, opLog, opLogIndex } = ctx.store;
  const body: Snapshot = {
    piles: piles.map(serializePile),
    activePileIndex,
    opLog: opLog.slice(0, opLogIndex),
  };
  await $fetch("/api/snapshots", { method: "POST", body });
  ctx.setStatus("Saved", { transient: true });
};

export const restoreSnapshot: UserActionFn = async (ctx) => {
  const { snapshots } = await $fetch("/api/snapshots");
  const snapshotId = await ctx.ask(
    "Select snapshot",
    snapshots.map((s) => s.createdAt),
    0,
    snapshots.map((s) => s.id),
  );
  if (snapshotId == null) return;

  ctx.setStatus("Loading...");
  const data = await $fetch(`/api/snapshots/${snapshotId}`);
  ctx.store.piles = data.piles.map((pile) => ({ ...pile, cards: pile.cards.map(makeCard) }));
  ctx.store.activePileIndex = data.activePileIndex;
  // We restore the op log, so the restore operation itself cannot be undone.
  ctx.store.opLog = data.opLog;
  ctx.store.opLogIndex = data.opLog.length;
  ctx.setStatus("Loaded", { transient: true });
};

function restoreLocationAndRevisions(ctx: ActionContext, entry: OpLogEntry) {
  [ctx.store.activePileIndex, ctx.store.activePile.pickedCardIndex] = entry.location;
  for (const { pileIndex, revisionId } of entry.revisions ?? []) {
    checked(ctx.store.piles[pileIndex]).revisionId = revisionId;
  }
}

export const applyOpLogReverse: UserActionFn = async (ctx) => {
  const entry = ctx.store.opLog[ctx.store.opLogIndex - 1];
  if (!entry) return;

  invokeCommand(ctx, entry.reverse);
  restoreLocationAndRevisions(ctx, entry);
  ctx.store.opLogIndex--;
};

export const applyOpLogForward: UserActionFn = async (ctx) => {
  const entry = ctx.store.opLog[ctx.store.opLogIndex];
  if (!entry) return;

  restoreLocationAndRevisions(ctx, entry);
  invokeCommand(ctx, entry.forward);
  ctx.store.opLogIndex++;
};
