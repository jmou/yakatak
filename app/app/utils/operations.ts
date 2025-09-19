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
  // Ask for a choice, as through ChooserDialog.
  ask: {
    (title: string, labels: string[]): Promise<number | null>;
    <T>(title: string, labels: string[], values: T[]): Promise<T | null>;
  };
  // Perform document.startViewTransition().
  viewTransition: (fn: () => void) => Promise<void>;
}

async function placeCardInto(
  ctx: OperationContext,
  target: CardLocation,
  options: { source?: CardLocation; followTarget?: boolean } = {},
): Promise<Command | undefined> {
  const { source = ctx.store.currentLocation, followTarget = false } = options;
  const { state } = ctx.store;

  const [sourcePile, targetPile] = [source, target].map((loc) => state.piles[loc[0]]);
  const [sourceCardIndex, targetCardIndex] = [source[1], target[1]];
  if (!sourcePile || !targetPile) return;
  if (!sourcePile.cards[sourceCardIndex]) return;
  if (targetCardIndex < 0 || targetCardIndex > targetPile.cards.length) return;

  await ctx.viewTransition(() => {
    const card = sourcePile.cards.splice(sourceCardIndex, 1)[0];
    assert(card);
    sourcePile.pickCardClamped(sourcePile.pickedCardIndex);
    targetPile.cards.splice(targetCardIndex, 0, card);

    // followTarget exists for cosmetic reasons. When swapping cards within
    // a pile, the selection follows the picked card to its target location.
    // While our caller could arrange for this update, it would happen after
    // the view transition. To avoid artifacts, we push it down here.
    if (followTarget) [state.activePileIndex, ctx.store.activePile.pickedCardIndex] = target;
  });

  return ["placeCardInto", source, { source: target, followTarget }];
}

async function movePickedCardToPile(
  ctx: OperationContext,
  pileIndex: number,
): Promise<Command | undefined> {
  const pile = ctx.store.state.piles[pileIndex];
  if (!pile) return;
  return placeCardInto(ctx, [pileIndex, pile.cards.length]);
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
  pileIndex: number = ctx.store.state.activePileIndex,
): Command {
  const pile = ctx.store.state.piles[pileIndex];
  assert(pile);
  pile.cards.reverse();
  pile.pickedCardIndex = pile.cards.length - 1 - pile.pickedCardIndex;
  return ["reverseCardsInPile", pileIndex];
}

function createPileAt(ctx: OperationContext, pileIndex: number): Command {
  ctx.store.state.piles.splice(pileIndex, 0, new Pile());
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
  const options = ctx.store.state.piles
    .slice(1)
    .map((pile, i) => `${i + 1}. ${pile.name ?? "(unnamed)"}`);
  const position = await ctx.ask("Piles", options);
  if (position == null) return;
  ctx.store.state.activePileIndex = position + 1;
}

function swapPiles(
  ctx: OperationContext,
  aPileIndex: number,
  bPileIndex: number,
): Command | undefined {
  const { state } = ctx.store;
  const [aPile, bPile] = [state.piles[aPileIndex], state.piles[bPileIndex]];
  if (aPileIndex < Pile.START || bPileIndex < Pile.START || !aPile || !bPile) return;
  [state.piles[aPileIndex], state.piles[bPileIndex]] = [bPile, aPile];
  return ["swapPiles", aPileIndex, bPileIndex];
}

function serializeState(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value as object;
  }
  if (Array.isArray(value)) {
    return value.map(serializeState);
  }
  return Object.entries(value).reduce(
    (acc, [key, value]) => {
      // TODO remove special case to avoid serializing Elements
      if (key === "elem") return acc;
      acc[key] = serializeState(value);
      return acc;
    },
    {} as Record<string, unknown>,
  );
}

function deserializeState(target: Record<string, unknown>, snapshot: Record<string, unknown>) {
  for (const key in snapshot) {
    const value = snapshot[key];
    // TODO remove special handling of Pile objects
    if (key === "piles" && Array.isArray(value)) {
      type PileData = { name: string; cards: Card[]; pickedCardIndex: number };
      target[key] = value.map((data: PileData) => new Pile(data));
    } else if (value === null || typeof value !== "object" || Array.isArray(value)) {
      target[key] = value;
    } else {
      deserializeState(target[key] as Record<string, unknown>, value as Record<string, unknown>);
    }
  }
}

async function takeSnapshot(ctx: OperationContext): Promise<undefined> {
  // TODO this status text should not auto reset
  ctx.store.status = "Saving...";
  ctx.store.postSnapshotBody = serializeState(ctx.store.state);
  await ctx.store.postSnapshot.execute();
  if (ctx.store.postSnapshot.error) {
    ctx.store.status = "ERROR";
  } else {
    ctx.store.status = "Saved";
  }
}

async function restoreSnapshot(ctx: OperationContext): Promise<undefined> {
  await ctx.store.listSnapshots.execute();
  if (ctx.store.listSnapshots.error) {
    ctx.store.status = "ERROR";
    return;
  }

  const { snapshots } = ctx.store.listSnapshots.data;
  ctx.store.getSnapshotId = await ctx.ask("Select snapshot", snapshots, snapshots);
  if (ctx.store.getSnapshotId == null) return;

  ctx.store.status = "Loading...";
  await ctx.store.getSnapshot.execute();
  if (ctx.store.getSnapshot.error) {
    ctx.store.status = "ERROR";
    return;
  }
  ctx.store.status = "Loaded";

  deserializeState(ctx.store.state, ctx.store.getSnapshot.data);
  // The op log will also be restored, which means the restore operation
  // cannot be undone.
}

async function applyOpLogReverse(ctx: OperationContext): Promise<undefined> {
  const { state } = ctx.store;
  const entry = state.opLog[state.opLogIndex - 1];
  if (!entry) return;

  await invokeCommand(ctx, entry.reverse);
  [state.activePileIndex, ctx.store.activePile.pickedCardIndex] = entry.location;
  state.opLogIndex--;
}

async function applyOpLogForward(ctx: OperationContext): Promise<undefined> {
  const { state } = ctx.store;
  const entry = state.opLog[state.opLogIndex];
  if (!entry) return;

  [state.activePileIndex, ctx.store.activePile.pickedCardIndex] = entry.location;
  await invokeCommand(ctx, entry.forward);
  state.opLogIndex++;
}

// Operations are actions on state, typically by the user. They return a
// reciprocable undo Command that restores any nontrivial state; if all
// modified state is trivial (like which card is picked) it returns undefined.
const opsByName = {
  pickCardLeft: (ctx: OperationContext) =>
    void ctx.store.activePile.pickCardClamped(ctx.store.activePile.pickedCardIndex - 1),
  pickCardRight: (ctx: OperationContext) =>
    void ctx.store.activePile.pickCardClamped(ctx.store.activePile.pickedCardIndex + 1),
  pickCardFirst: (ctx: OperationContext) => void ctx.store.activePile.pickCardClamped(0),
  pickCardLast: (ctx: OperationContext) =>
    void ctx.store.activePile.pickCardClamped(ctx.store.activePile.cards.length - 1),

  placeCardInto,
  swapPickedCardWithNeighbor,
  movePickedCardToPile,
  discardPickedCard: (ctx: OperationContext) => movePickedCardToPile(ctx, Pile.DISCARD),

  openPickedCardPage: (ctx: OperationContext): undefined => {
    if (ctx.store.pickedCard) open(ctx.store.pickedCard.url);
  },

  reverseCardsInPile,

  activatePileUp: (ctx: OperationContext) => void ctx.store.state.activePileIndex--,
  activatePileDown: (ctx: OperationContext) => void ctx.store.state.activePileIndex++,

  createPileUp: (ctx: OperationContext) => createPileAt(ctx, ctx.store.state.activePileIndex),
  createPileDown: (ctx: OperationContext) => createPileAt(ctx, ++ctx.store.state.activePileIndex),
  removePileUnchecked: (ctx: OperationContext, pileIndex: number) =>
    void ctx.store.state.piles.splice(pileIndex, 1),

  nameActivePile,
  goToChosenPile,

  swapPiles,
  swapActivePileUp: (ctx: OperationContext) =>
    swapPiles(ctx, ctx.store.state.activePileIndex, --ctx.store.state.activePileIndex),
  swapActivePileDown: (ctx: OperationContext) =>
    swapPiles(ctx, ctx.store.state.activePileIndex, ++ctx.store.state.activePileIndex),

  takeSnapshot,
  restoreSnapshot,

  applyOpLogReverse,
  applyOpLogForward,
};

// Perform the operation requested by the Command.
export async function invokeCommand(ctx: OperationContext, cmd: Command) {
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
  return Promise.resolve(opFn(ctx, ...opArgs));
}
