<script setup lang="ts">
import { refAutoReset, useFetch, whenever } from "@vueuse/core";
import { computed, nextTick, reactive, ref, useTemplateRef, watch, watchEffect } from "vue";
import ChooserDialog from "./components/ChooserDialog.vue";
import DetailsPane from "./components/DetailsPane.vue";
import PilesPane from "./components/PilesPane.vue";
import { assert, Card, checked, Pile, type CardData } from "./lib/common.ts";

// A Command describes how to run an operation defined in opsByName. It is
// a type-checked tuple of the form [opName, ...opArgs].
type Command = {
  [K in keyof typeof opsByName]: [K, ...Parameters<(typeof opsByName)[K]>];
}[keyof typeof opsByName];

// The operation (or undo) log stores pairs of Commands that built up the
// current state or can be reversed in sequence to revert to a previous state.
interface OpLogEntry {
  forward: Command;
  reverse: Command;
  location: Location;
}

type Location = readonly [pileIndex: number, cardIndex: number];

const getDeck = reactive(useFetch("/api/deck").json<CardData[]>());

const listSnapshots = reactive(useFetch("/api/snapshots", { immediate: false }).json());
const postSnapshotBody = ref<unknown | null>(null);
const postSnapshot = reactive(
  useFetch("/api/snapshots", { immediate: false }).post(postSnapshotBody).json(),
);
const getSnapshotId = ref<string | null>(null);
const getSnapshot = reactive(
  useFetch(() => `/api/snapshots/${getSnapshotId.value}`, { immediate: false }).json(),
);

const status = refAutoReset("", 5000);

const state = reactive({
  piles: [new Pile(), new Pile()],
  activePileIndex: Pile.START,
  opLog: [] as OpLogEntry[],
  opLogIndex: 0,
});

const activePile = computed(() => checked(state.piles[state.activePileIndex]));
const pickedCard = computed(() => activePile.value.cards[activePile.value.pickedCardIndex]);
const currentLocation = computed<Location>(() => [
  state.activePileIndex,
  activePile.value.pickedCardIndex,
]);

whenever(
  () => getDeck.isFinished && !getDeck.error,
  () => {
    // TODO validate data
    assert(getDeck.data);
    state.piles[1]!.cards = getDeck.data.map((data) => new Card(data));
  },
);

// Bounds constrain active.
watchEffect(() => {
  if (state.activePileIndex < Pile.START) {
    state.activePileIndex = Pile.START;
  } else if (state.activePileIndex >= state.piles.length) {
    state.activePileIndex = state.piles.length - 1;
  }
});

function scrollToActivePile() {
  activePile.value.elem?.scrollIntoView?.({ block: "nearest" });
}
watchEffect(scrollToActivePile);

const chooser = useTemplateRef("chooser");
const detailsElem = ref<HTMLElement>();

watch(pickedCard, () => (detailsElem.value!.scrollTop = 0));

async function viewTransition(fn: () => void): Promise<void> {
  if (!document.startViewTransition) {
    fn();
  } else {
    return document.startViewTransition(() => {
      fn();
      return nextTick();
    }).updateCallbackDone;
  }
}

async function placeCardInto(
  target: Location,
  options: { source?: Location; followTarget?: boolean } = {},
): Promise<Command | void> {
  const { source = currentLocation.value, followTarget = false } = options;

  const [sourcePile, targetPile] = [source, target].map((loc) => state.piles[loc[0]]);
  const [sourceCardIndex, targetCardIndex] = [source[1], target[1]];
  if (!sourcePile || !targetPile) return;
  if (!sourcePile.cards[sourceCardIndex]) return;
  if (targetCardIndex < 0 || targetCardIndex > targetPile.cards.length) return;

  await viewTransition(() => {
    const card = sourcePile.cards.splice(sourceCardIndex, 1)[0];
    assert(card);
    sourcePile.pickCardClamped(sourcePile.pickedCardIndex);
    targetPile.cards.splice(targetCardIndex, 0, card);

    // followTarget exists for cosmetic reasons. When swapping cards within
    // a pile, the selection follows the picked card to its target location.
    // While our caller could arrange for this update, it would happen after
    // the view transition. To avoid artifacts, we push it down here.
    if (followTarget) [state.activePileIndex, activePile.value.pickedCardIndex] = target;
  });

  return ["placeCardInto", source, { source: target, followTarget }];
}

async function movePickedCardToPile(pileIndex: number): Promise<Command | void> {
  const pile = state.piles[pileIndex];
  if (!pile) return;
  return placeCardInto([pileIndex, pile.cards.length]);
}

async function swapPickedCardWithNeighbor(direction: "left" | "right"): Promise<Command | void> {
  const source = currentLocation.value;
  const offset = direction == "left" ? -1 : 1;
  const target: Location = [source[0], source[1] + offset];
  return placeCardInto(target, { source, followTarget: true });
}

function reverseCardsInPile(pileIndex: number = state.activePileIndex): Command {
  const pile = state.piles[pileIndex];
  assert(pile);
  pile.cards.reverse();
  pile.pickedCardIndex = pile.cards.length - 1 - pile.pickedCardIndex;
  return ["reverseCardsInPile", pileIndex];
}

function createPileAt(pileIndex: number): Command {
  state.piles.splice(pileIndex, 0, new Pile());
  return ["removePileUnchecked", pileIndex];
}

function nameActivePile(name?: string | null): Command | void {
  if (!name) name = prompt("Pile name", activePile.value.name);
  if (!name) return;
  const oldName = activePile.value.name;
  activePile.value.name = name;
  return ["nameActivePile", oldName];
}

async function goToChosenPile(): Promise<void> {
  const options = state.piles.slice(1).map((pile, i) => `${i + 1}. ${pile.name ?? "(unnamed)"}`);
  const position = await chooser.value!.ask("Piles", options);
  if (position == null) return;
  state.activePileIndex = position + 1;
}

function swapPiles(aPileIndex: number, bPileIndex: number): Command | void {
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

async function takeSnapshot() {
  // TODO this status text should not auto reset
  status.value = "Saving...";
  postSnapshotBody.value = serializeState(state);
  await postSnapshot.execute();
  if (postSnapshot.error) {
    status.value = "ERROR";
  } else {
    status.value = "Saved";
  }
}

async function restoreSnapshot(): Promise<void> {
  await listSnapshots.execute();
  if (listSnapshots.error) {
    status.value = "ERROR";
    return;
  }

  const { snapshots } = listSnapshots.data;
  getSnapshotId.value = await chooser.value!.ask("Select snapshot", snapshots, snapshots);
  if (getSnapshotId.value == null) return;

  status.value = "Loading...";
  await getSnapshot.execute();
  if (getSnapshot.error) {
    status.value = "ERROR";
    return;
  }
  status.value = "Loaded";

  deserializeState(state, getSnapshot.data);
  // The op log will also be restored, which means the restore operation
  // cannot be undone.
}

async function applyOpLogReverse() {
  const entry = state.opLog[state.opLogIndex - 1];
  if (!entry) return;

  await invokeCommand(entry.reverse);
  [state.activePileIndex, activePile.value.pickedCardIndex] = entry.location;
  state.opLogIndex--;
}

async function applyOpLogForward() {
  const entry = state.opLog[state.opLogIndex];
  if (!entry) return;

  [state.activePileIndex, activePile.value.pickedCardIndex] = entry.location;
  await invokeCommand(entry.forward);
  state.opLogIndex++;
}

// Perform the operation requested by the Command.
async function invokeCommand(cmd: Command) {
  const [opName, ...opArgs] = cmd;
  // This partially elided type exists only to check that all operations return
  // Command (or void). We still use the discriminated type elsewhere.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type FunctionReturnsCommand = (...args: any[]) => Command | void | Promise<Command | void>;
  // If type checking has an error on this line, there probably exists an
  // operation in opsByName that does not return Command or void.
  const opFn: FunctionReturnsCommand = opsByName[opName];
  return Promise.resolve(opFn(...opArgs));
}

// Operations are actions on state, typically by the user. They return a
// reciprocable undo Command that restores any nontrivial state; if all
// modified state is trivial (like which card is picked) it returns void.
const opsByName = {
  pickCardLeft: () => activePile.value.pickCardClamped(activePile.value.pickedCardIndex - 1),
  pickCardRight: () => activePile.value.pickCardClamped(activePile.value.pickedCardIndex + 1),
  pickCardFirst: () => activePile.value.pickCardClamped(0),
  pickCardLast: () => activePile.value.pickCardClamped(activePile.value.cards.length - 1),

  placeCardInto,
  swapPickedCardWithNeighbor,
  movePickedCardToPile,
  discardPickedCard: () => movePickedCardToPile(Pile.DISCARD),

  openPickedCardPage: () => {
    if (pickedCard.value) open(pickedCard.value.url);
  },

  reverseCardsInPile,

  activatePileUp: () => void state.activePileIndex--,
  activatePileDown: () => void state.activePileIndex++,

  createPileUp: () => createPileAt(state.activePileIndex),
  createPileDown: () => createPileAt(++state.activePileIndex),
  removePileUnchecked: (pileIndex: number) => void state.piles.splice(pileIndex, 1),

  nameActivePile,
  goToChosenPile,

  swapPiles,
  swapActivePileUp: () => swapPiles(state.activePileIndex, --state.activePileIndex),
  swapActivePileDown: () => swapPiles(state.activePileIndex, ++state.activePileIndex),

  takeSnapshot,
  restoreSnapshot,

  applyOpLogReverse,
  applyOpLogForward,
};

const rootKeyBindings: Readonly<Record<string, Command>> = {
  h: ["pickCardLeft"],
  j: ["activatePileDown"],
  k: ["activatePileUp"],
  l: ["pickCardRight"],

  H: ["swapPickedCardWithNeighbor", "left"],
  K: ["swapActivePileUp"],
  J: ["swapActivePileDown"],
  L: ["swapPickedCardWithNeighbor", "right"],

  "^": ["pickCardFirst"],
  $: ["pickCardLast"],

  "1": ["movePickedCardToPile", 1],
  "2": ["movePickedCardToPile", 2],
  "3": ["movePickedCardToPile", 3],
  "4": ["movePickedCardToPile", 4],
  "5": ["movePickedCardToPile", 5],
  "6": ["movePickedCardToPile", 6],
  "7": ["movePickedCardToPile", 7],
  "8": ["movePickedCardToPile", 8],
  "9": ["movePickedCardToPile", 9],
  "0": ["movePickedCardToPile", 10],

  Enter: ["openPickedCardPage"],
  d: ["discardPickedCard"],

  o: ["createPileDown"],
  O: ["createPileUp"],
  n: ["nameActivePile"],
  g: ["goToChosenPile"],
  R: ["reverseCardsInPile"],

  s: ["takeSnapshot"],
  S: ["restoreSnapshot"],

  u: ["applyOpLogReverse"],
  U: ["applyOpLogForward"],
};

async function handleKeyEvent(event: KeyboardEvent) {
  const forward = rootKeyBindings[event.key];
  if (!forward) return;

  const location = currentLocation.value;
  const reverse = await invokeCommand(forward);
  if (reverse) {
    state.opLog.splice(state.opLogIndex);
    state.opLog[state.opLogIndex++] = { forward, reverse, location };
  }
}

// FIFO to serialize event handling.
const events: KeyboardEvent[] = [];
let eventsPromise: Promise<void> | null = null;

async function startEventProcessing() {
  while (true) {
    const event = events.shift();
    if (!event) break;
    await handleKeyEvent(event);
  }
  eventsPromise = null;
}

function onKeydown(event: KeyboardEvent) {
  events.push(event);
  if (!eventsPromise) eventsPromise = startEventProcessing();
}
</script>

<template>
  <main>
    <DetailsPane
      :loading="getDeck.isFetching"
      :error="getDeck.error"
      :card="pickedCard"
      v-model:elem="detailsElem"
      tabindex="0"
      autofocus
      @keydown="onKeydown"
    />
    <PilesPane
      v-model:active="state.activePileIndex"
      :piles="state.piles"
      tabindex="-1"
      @auto-scroll="scrollToActivePile"
      @focus="detailsElem!.focus()"
    />
    <div v-if="status" class="status">{{ status }}</div>
    <ChooserDialog ref="chooser" />
  </main>
</template>

<style scoped>
main {
  display: flex;
  height: 100vh;
}

.status {
  position: fixed;
  bottom: 0;
  right: 0;
  padding: 2px;
  background: #eee;
  border: 1px 0 0 1px solid #888;
}
</style>

<style>
:root {
  font-family: system-ui, Arial, Helvetica, sans-serif;
  font-size: 16px;
  background: #eee;
}
</style>
