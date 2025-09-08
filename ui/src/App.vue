<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch, watchEffect } from "vue";
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

const loading = ref(true);
const error = ref<string | null>(null);

async function init() {
  try {
    const response = await fetch("/api/deck");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const cards: CardData[] = await response.json();
    state.piles[1]!.cards = cards.map((data) => new Card(data));
  } catch (err) {
    error.value = "" + err;
    console.error("init failed:", err);
  } finally {
    loading.value = false;
  }
}

const state = reactive({
  piles: [new Pile(), new Pile()],
  active: Pile.START,
  opLog: [] as OpLogEntry[],
  opLogIndex: 0,
});

const activePile = computed(() => checked(state.piles[state.active]));
const pickedCard = computed(() => activePile.value.cards[activePile.value.picked]);
const currentLocation = computed<Location>(() => [state.active, activePile.value.picked]);

// Bounds constrain active.
watchEffect(() => {
  if (state.active < Pile.START) {
    state.active = Pile.START;
  } else if (state.active >= state.piles.length) {
    state.active = state.piles.length - 1;
  }
});

function scrollToActivePile() {
  activePile.value.elem?.scrollIntoView?.({ block: "nearest" });
}
watchEffect(scrollToActivePile);

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
    sourcePile.pickCardClamped(sourcePile.picked);
    targetPile.cards.splice(targetCardIndex, 0, card);

    // followTarget exists for cosmetic reasons. When swapping cards within
    // a pile, the selection follows the picked card to its target location.
    // While our caller could arrange for this update, it would happen after
    // the view transition. To avoid artifacts, we push it down here.
    if (followTarget) [state.active, activePile.value.picked] = target;
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

function reverseCardsInPile(pileIndex: number = state.active): Command {
  const pile = state.piles[pileIndex];
  assert(pile);
  pile.cards.reverse();
  pile.picked = pile.cards.length - 1 - pile.picked;
  return ["reverseCardsInPile", pileIndex];
}

function createPileAt(pileIndex: number): Command {
  state.piles.splice(pileIndex, 0, new Pile());
  return ["removePileUnchecked", pileIndex];
}

function swapPiles(aPileIndex: number, bPileIndex: number): Command | void {
  const [aPile, bPile] = [state.piles[aPileIndex], state.piles[bPileIndex]];
  if (aPileIndex < Pile.START || bPileIndex < Pile.START || !aPile || !bPile) return;
  [state.piles[aPileIndex], state.piles[bPileIndex]] = [bPile, aPile];
  return ["swapPiles", aPileIndex, bPileIndex];
}

async function applyOpLogReverse() {
  const entry = state.opLog[state.opLogIndex - 1];
  if (!entry) return;

  await invokeCommand(entry.reverse);
  [state.active, activePile.value.picked] = entry.location;
  state.opLogIndex--;
}

async function applyOpLogForward() {
  const entry = state.opLog[state.opLogIndex];
  if (!entry) return;

  [state.active, activePile.value.picked] = entry.location;
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
  pickCardLeft: () => activePile.value.pickCardClamped(activePile.value.picked - 1),
  pickCardRight: () => activePile.value.pickCardClamped(activePile.value.picked + 1),
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

  activatePileUp: () => void state.active--,
  activatePileDown: () => void state.active++,

  createPileUp: () => createPileAt(state.active),
  createPileDown: () => createPileAt(++state.active),
  removePileUnchecked: (pileIndex: number) => void state.piles.splice(pileIndex, 1),

  swapPiles,
  swapActivePileUp: () => swapPiles(state.active, --state.active),
  swapActivePileDown: () => swapPiles(state.active, ++state.active),

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
  R: ["reverseCardsInPile"],

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
    const event = events.shift()
    if (!event) break;
    await handleKeyEvent(event);
  }
  eventsPromise = null;
}

function onKeydown(event: KeyboardEvent) {
  events.push(event);
  if (!eventsPromise) eventsPromise = startEventProcessing();
}

onMounted(async () => {
  await init();
  detailsElem.value!.focus();
});
</script>

<template>
  <main>
    <DetailsPane
      :loading
      :error
      :card="pickedCard"
      v-model:elem="detailsElem"
      tabindex="0"
      @keydown="onKeydown"
    />
    <PilesPane
      v-model:active="state.active"
      :piles="state.piles"
      tabindex="-1"
      @auto-scroll="scrollToActivePile"
      @focus="detailsElem!.focus()"
    />
  </main>
</template>

<style scoped>
main {
  display: flex;
  height: 100vh;
}
</style>

<style>
:root {
  font-family: system-ui, Arial, Helvetica, sans-serif;
  font-size: 16px;
  background: #eee;
}
</style>
