// Operations are mutations to workspace state; they should not interact
// directly with the user nor have other side effects. They return a
// reciprocable undo Command that restores any nontrivial state.

// https://stackoverflow.com/a/67605309/13773246
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParametersExceptFirst<F> = F extends (arg0: any, ...rest: infer R) => any ? R : never;

// Command serializes an operation as defined in opsByName. It is a type-checked
// tuple of the form [opName, ...opArgs].
export type Command = {
  [K in keyof typeof opsByName]: [K, ...ParametersExceptFirst<(typeof opsByName)[K]>];
}[keyof typeof opsByName];

type CardsStore = ReturnType<typeof useCardsStore>;

export interface OperationContext {
  store: CardsStore;
  // Perform document.startViewTransition().
  viewTransition: <T>(fn: () => T) => Promise<T>;
}

async function pushDelta(pile: Pile, card: Card | null, position: number, oldPosition?: number) {
  if (pile.deckId == null || pile.revisionId == null) return;
  const { deckId, revisionId } = pile;
  const body = { deckId, revisionId, position, oldPosition, cardId: card?.id };
  await $fetch(`/api/deltas`, {
    method: "POST",
    body,
  });
}

// TODO simplify options
async function moveCard(
  ctx: OperationContext,
  source: CardLocation,
  target: CardLocation,
  options: { restorePicked?: number; followTarget?: boolean } = {},
): Promise<Command> {
  const { restorePicked, followTarget = false } = options;

  const sourcePile = checked(ctx.store.piles[source[0]]);
  const targetPile = checked(ctx.store.piles[target[0]]);
  const [sourceCardIndex, targetCardIndex] = [source[1], target[1]];
  assert(sourcePile != targetPile || sourceCardIndex != targetCardIndex);

  checked(sourcePile.cards[sourceCardIndex]);

  assert(targetCardIndex >= 0);
  assert(targetCardIndex < targetPile.cards.length + (sourcePile === targetPile ? 0 : 1));

  const originalTargetPicked = targetPile.pickedCardIndex;

  const card = await ctx.viewTransition(() => {
    const card = checked(sourcePile.cards.splice(sourceCardIndex, 1)[0]);
    if (restorePicked !== undefined) sourcePile.pickedCardIndex = restorePicked;
    targetPile.cards.splice(targetCardIndex, 0, card);
    targetPile.pickedCardIndex = targetCardIndex;

    // followTarget exists for cosmetic reasons. When swapping cards within
    // a pile, the selection follows the picked card to its target location.
    // While our caller could arrange for this update, it would happen after
    // the view transition. To avoid artifacts, we push it down here.
    if (followTarget) [ctx.store.activePileIndex, ctx.store.activePile.pickedCardIndex] = target;

    return card;
  });

  // TODO disable during replay
  if (sourcePile !== targetPile) {
    await pushDelta(sourcePile, null, sourceCardIndex);
    await pushDelta(targetPile, card, targetCardIndex);
  } else {
    await pushDelta(targetPile, card, targetCardIndex, sourceCardIndex);
  }

  return ["moveCard", target, source, { followTarget, restorePicked: originalTargetPicked }];
}

function reverseCardsInPile(
  ctx: OperationContext,
  pileIndex: number = ctx.store.activePileIndex,
): Command {
  const pile = checked(ctx.store.piles[pileIndex]);
  pile.cards.reverse();
  pile.pickedCardIndex = pile.cards.length - 1 - pile.pickedCardIndex;
  return ["reverseCardsInPile", pileIndex];
}

function createPile(ctx: OperationContext, pileIndex: number): Command {
  ctx.store.insertPile(pileIndex);
  ctx.store.activePileIndex = pileIndex;
  return ["removeEmptyPile", pileIndex];
}

function removeEmptyPile(ctx: OperationContext, pileIndex: number): Command {
  if (ctx.store.piles[pileIndex]?.cards?.length !== 0) {
    throw new Error("Cannot remove non-empty pile");
  }
  ctx.store.piles.splice(pileIndex, 1);
  return ["createPile", pileIndex];
}

function namePile(ctx: OperationContext, pileIndex: number, name: string): Command {
  const pile = checked(ctx.store.piles[pileIndex]);
  const oldName = pile.name;
  pile.name = name;
  return ["namePile", pileIndex, oldName];
}

function swapPiles(ctx: OperationContext, aPileIndex: number, bPileIndex: number): Command {
  assert(aPileIndex >= PILE_START);
  assert(bPileIndex >= PILE_START);
  const [aPile, bPile] = [ctx.store.piles[aPileIndex], ctx.store.piles[bPileIndex]];
  assert(aPile);
  assert(bPile);
  [ctx.store.piles[aPileIndex], ctx.store.piles[bPileIndex]] = [bPile, aPile];
  return ["swapPiles", aPileIndex, bPileIndex];
}

// TODO this should probably be revamped around dirty decks
async function loadPileFromDeckRevision(
  ctx: OperationContext,
  pileIndex: number,
  revisionId?: number,
): Promise<Command | undefined> {
  const pile = ctx.store.piles[pileIndex];
  if (pile?.deckId == null) return;

  const oldRevision = await $fetch(`/api/decks/${pile.deckId}/revisions`, {
    method: "POST",
    body: { hidden: true, card_ids: pile.cards.map((card) => card.id) },
  });

  const revision = await $fetch(`/api/decks/${pile.deckId}/revisions/${revisionId ?? "latest"}`);
  pile.revisionId = revision.id;
  pile.cards = revision.cards.map((card) => ({
    id: card.id,
    url: card.url ?? "",
    title: card.title ?? "(unknown)",
    numTiles: card.numTiles,
  }));

  return ["loadPileFromDeckRevision", pileIndex, oldRevision.id];
}

const opsByName = {
  createPile,
  removeEmptyPile,
  namePile,
  swapPiles,

  moveCard,
  reverseCardsInPile,

  loadPileFromDeckRevision,
};

// Perform the operation requested by the Command.
export async function invokeCommand(
  ctx: OperationContext,
  cmd: Command,
): Promise<Command | undefined> {
  const [opName, ...opArgs] = cmd;
  // This partially elided type exists only to check that all operations return
  // Command (or undefined). We still use the discriminated type elsewhere.
  type FunctionReturnsCommand = (
    ctx: OperationContext,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) => MaybePromise<Command | undefined>;
  // If type checking has an error on this line, there probably exists an
  // operation in opsByName that does not return Command or undefined.
  const opFn: FunctionReturnsCommand = opsByName[opName];
  return Promise.resolve(opFn(ctx, ...opArgs));
}
