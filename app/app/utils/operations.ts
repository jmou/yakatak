// https://stackoverflow.com/a/67605309/13773246
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParametersExceptFirst<F> = F extends (arg0: any, ...rest: infer R) => any ? R : never;

// A Command describes how to run an operation defined in opsByName. It is
// a type-checked tuple of the form [opName, ...opArgs].
export type Command = {
  [K in keyof typeof opsByName]: [K, ...ParametersExceptFirst<(typeof opsByName)[K]>];
}[keyof typeof opsByName];

type CardsStore = ReturnType<typeof useCardsStore>;

interface OperationContext {
  store: CardsStore;
  setStatus: (msg: string, options?: { transient?: boolean }) => void;
  // Ask for a choice, as through ChooserDialog.
  ask: {
    (title: string, labels: string[]): Promise<number | null>;
    <T>(title: string, labels: string[], values: T[]): Promise<T | null>;
  };
  // Perform document.startViewTransition().
  viewTransition: (fn: () => void) => Promise<void>;
}

function pickCardClamped(pile: Pile, cardIndex: number): undefined {
  pile.pickedCardIndex = Math.max(0, Math.min(cardIndex, pile.cards.length - 1));
}

async function placeCardInto(
  ctx: OperationContext,
  target: CardLocation,
  options: { source?: CardLocation; restorePicked?: number; followTarget?: boolean } = {},
): Promise<Command | undefined> {
  const { source = ctx.store.currentLocation, restorePicked, followTarget = false } = options;
  if (source[0] === target[0] && source[1] === target[1]) return;

  const [sourcePile, targetPile] = [source, target].map((loc) => ctx.store.piles[loc[0]]);
  const [sourceCardIndex, targetCardIndex] = [source[1], target[1]];
  if (!sourcePile || !targetPile) return;
  if (!sourcePile.cards[sourceCardIndex]) return;
  if (targetCardIndex < 0 || targetCardIndex > targetPile.cards.length) return;
  if (sourcePile === targetPile && targetCardIndex >= targetPile.cards.length) return;

  const originalTargetPicked = targetPile.pickedCardIndex;

  await ctx.viewTransition(() => {
    const card = sourcePile.cards.splice(sourceCardIndex, 1)[0];
    assert(card);
    if (restorePicked !== undefined) {
      sourcePile.pickedCardIndex = restorePicked;
    } else {
      pickCardClamped(sourcePile, sourcePile.pickedCardIndex);
    }
    targetPile.cards.splice(targetCardIndex, 0, card);
    targetPile.pickedCardIndex = targetCardIndex;

    // followTarget exists for cosmetic reasons. When swapping cards within
    // a pile, the selection follows the picked card to its target location.
    // While our caller could arrange for this update, it would happen after
    // the view transition. To avoid artifacts, we push it down here.
    if (followTarget) [ctx.store.activePileIndex, ctx.store.activePile.pickedCardIndex] = target;
  });

  const reverseOptions = { source: target, followTarget, restorePicked: originalTargetPicked };
  return ["placeCardInto", source, reverseOptions];
}

async function movePickedCardToPile(
  ctx: OperationContext,
  pileIndex: number,
): Promise<Command | undefined> {
  const pile = ctx.store.piles[pileIndex];
  if (!pile) return;

  let cardIndex = pile.cards.length;
  if (pileIndex === ctx.store.activePileIndex) cardIndex--;

  return placeCardInto(ctx, [pileIndex, cardIndex]);
}

async function swapPickedCardWithNeighbor(
  ctx: OperationContext,
  direction: "left" | "right",
): Promise<Command | undefined> {
  const source = ctx.store.currentLocation;
  const offset = direction == "left" ? -1 : 1;
  const target: CardLocation = [source[0], source[1] + offset];
  return placeCardInto(ctx, target, { source, followTarget: true });
}

function reverseCardsInPile(
  ctx: OperationContext,
  pileIndex: number = ctx.store.activePileIndex,
): Command {
  const pile = ctx.store.piles[pileIndex];
  assert(pile);
  pile.cards.reverse();
  pile.pickedCardIndex = pile.cards.length - 1 - pile.pickedCardIndex;
  return ["reverseCardsInPile", pileIndex];
}

function createPileAt(ctx: OperationContext, pileIndex: number): Command {
  ctx.store.insertPile(pileIndex);
  return ["removePileUnchecked", pileIndex];
}

function nameActivePile(ctx: OperationContext, name?: string | null): Command | undefined {
  if (!name) name = prompt("Pile name", ctx.store.activePile.name);
  if (!name) return;
  const oldName = ctx.store.activePile.name;
  ctx.store.activePile.name = name;
  return ["nameActivePile", oldName];
}

async function goToChosenPile(ctx: OperationContext): Promise<undefined> {
  const options = ctx.store.piles
    .slice(PILE_START)
    .map((pile, i) => `${i + 1}. ${pile.name ?? "(unnamed)"}`);
  const position = await ctx.ask("Piles", options);
  if (position == null) return;
  ctx.store.activePileIndex = PILE_START + position;
}

function swapPiles(
  ctx: OperationContext,
  aPileIndex: number,
  bPileIndex: number,
): Command | undefined {
  const [aPile, bPile] = [ctx.store.piles[aPileIndex], ctx.store.piles[bPileIndex]];
  if (aPileIndex < PILE_START || bPileIndex < PILE_START || !aPile || !bPile) return;
  [ctx.store.piles[aPileIndex], ctx.store.piles[bPileIndex]] = [bPile, aPile];
  return ["swapPiles", aPileIndex, bPileIndex];
}

function serializeCard(card: Card) {
  const { id, url, title, numTiles } = card;
  return { id, url, title, numTiles };
}

function serializePile(pile: Pile) {
  const { name, pickedCardIndex } = pile;
  const cards = pile.cards.map(serializeCard);
  return { name, cards, pickedCardIndex };
}

async function takeSnapshot(ctx: OperationContext): Promise<undefined> {
  ctx.setStatus("Saving...");
  const { piles, activePileIndex, opLog, opLogIndex } = ctx.store;
  const body: Snapshot = {
    piles: piles.map(serializePile),
    activePileIndex,
    opLog: opLog.slice(0, opLogIndex),
  };
  await $fetch("/api/snapshots", { method: "POST", body });
  ctx.setStatus("Saved", { transient: true });
}

async function restoreSnapshot(ctx: OperationContext): Promise<undefined> {
  const { snapshots } = await $fetch("/api/snapshots");
  const snapshotId = await ctx.ask("Select snapshot", snapshots, snapshots);
  if (snapshotId == null) return;

  ctx.setStatus("Loading...");
  const data = await $fetch(`/api/snapshots/${snapshotId}`);
  ctx.store.piles = data.piles;
  ctx.store.activePileIndex = data.activePileIndex;
  // We restore the op log, so the restore operation itself cannot be undone.
  ctx.store.opLog = data.opLog;
  ctx.store.opLogIndex = data.opLog.length;
  ctx.setStatus("Loaded", { transient: true });
}

async function applyOpLogReverse(ctx: OperationContext): Promise<undefined> {
  const entry = ctx.store.opLog[ctx.store.opLogIndex - 1];
  if (!entry) return;

  await invokeCommand(ctx, entry.reverse);
  [ctx.store.activePileIndex, ctx.store.activePile.pickedCardIndex] = entry.location;
  ctx.store.opLogIndex--;
}

async function applyOpLogForward(ctx: OperationContext): Promise<undefined> {
  const entry = ctx.store.opLog[ctx.store.opLogIndex];
  if (!entry) return;

  [ctx.store.activePileIndex, ctx.store.activePile.pickedCardIndex] = entry.location;
  await invokeCommand(ctx, entry.forward);
  ctx.store.opLogIndex++;
}

// Operations are actions on state, typically by the user. They return a
// reciprocable undo Command that restores any nontrivial state; if all
// modified state is trivial (like which card is picked) it returns undefined.
const opsByName = {
  pickCard: (ctx: OperationContext, pileIndex: number, cardIndex: number) =>
    pickCardClamped(ctx.store.piles[pileIndex]!, cardIndex),
  pickCardLeft: (ctx: OperationContext) =>
    pickCardClamped(ctx.store.activePile, ctx.store.activePile.pickedCardIndex - 1),
  pickCardRight: (ctx: OperationContext) =>
    pickCardClamped(ctx.store.activePile, ctx.store.activePile.pickedCardIndex + 1),
  pickCardFirst: (ctx: OperationContext) => pickCardClamped(ctx.store.activePile, 0),
  pickCardLast: (ctx: OperationContext) =>
    pickCardClamped(ctx.store.activePile, ctx.store.activePile.cards.length - 1),

  placeCardInto,
  swapPickedCardWithNeighbor,
  movePickedCardToPile,
  discardPickedCard: (ctx: OperationContext) => movePickedCardToPile(ctx, PILE_DISCARD),

  openPickedCardPage: (ctx: OperationContext): undefined => {
    if (ctx.store.pickedCard) open(ctx.store.pickedCard.url);
  },

  reverseCardsInPile,

  activatePileUp: (ctx: OperationContext) => void ctx.store.decrementActivePileIndex(),
  activatePileDown: (ctx: OperationContext) => void ctx.store.incrementActivePileIndex(),

  createPileUp: (ctx: OperationContext) => createPileAt(ctx, ctx.store.activePileIndex),
  // Increment activePileIndex without bounds check to extend the array.
  createPileDown: (ctx: OperationContext) => createPileAt(ctx, ++ctx.store.activePileIndex),
  removePileUnchecked: (ctx: OperationContext, pileIndex: number) =>
    void ctx.store.piles.splice(pileIndex, 1),

  nameActivePile,
  goToChosenPile,

  swapPiles,
  swapActivePileUp: (ctx: OperationContext) =>
    swapPiles(ctx, ctx.store.activePileIndex, ctx.store.decrementActivePileIndex()),
  swapActivePileDown: (ctx: OperationContext) =>
    swapPiles(ctx, ctx.store.activePileIndex, ctx.store.incrementActivePileIndex()),

  takeSnapshot,
  restoreSnapshot,

  applyOpLogReverse,
  applyOpLogForward,
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
  ) => Command | undefined | Promise<Command | undefined>;
  // If type checking has an error on this line, there probably exists an
  // operation in opsByName that does not return Command or undefined.
  const opFn: FunctionReturnsCommand = opsByName[opName];
  return Promise.resolve(opFn(ctx, ...opArgs)).catch((error): undefined => {
    ctx.setStatus("ERROR");
    console.error(error);
  });
}
