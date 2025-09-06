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

interface Location {
  pileIndex: number;
  cardIndex: number;
}

const loading = ref(true);
const error = ref<string | null>(null);

async function init() {
  try {
    const response = await fetch("/api/deck");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const cards: CardData[] = await response.json();
    state.piles[0]!.cards = cards.map((data) => new Card(data));
  } catch (err) {
    error.value = "" + err;
    console.error("init failed:", err);
  } finally {
    loading.value = false;
  }
}

const state = reactive({
  piles: [new Pile()],
  active: 0,
  opLog: [] as OpLogEntry[],
  opLogIndex: 0,
});

const activePile = computed(() => checked(state.piles[state.active]));
const pickedCard = computed(() => activePile.value.cards?.[activePile.value.picked]);
const currentLocation = computed(() => ({
  pileIndex: state.active,
  cardIndex: activePile.value.picked,
}));

// Bounds constrain active.
watchEffect(() => {
  if (state.active < 0) {
    state.active = 0;
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

function viewTransition(fn: () => void) {
  if (!document.startViewTransition) {
    fn();
  } else {
    document.startViewTransition(() => {
      fn();
      return nextTick();
    });
  }
}

function movePickedCardToPile(pileIndex: number | null): Command | void {
  if (!pickedCard.value) return;
  const targetPile = pileIndex == null ? null : state.piles[pileIndex];
  if (targetPile === undefined) return;

  viewTransition(() => {
    const card = activePile.value.cards.splice(activePile.value.picked, 1)[0];
    assert(card);
    if (targetPile !== null) {
      targetPile.cards.push(card);
    }
    activePile.value.pickCardClamped(activePile.value.picked);
  });

  // TODO implement undo
  return ["irreversible"];
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
  return ["removePile", pileIndex];
}

function swapPiles(aPileIndex: number, bPileIndex: number): Command | void {
  const [aPile, bPile] = [state.piles[aPileIndex], state.piles[bPileIndex]];
  if (!aPile || !bPile) return;
  [state.piles[aPileIndex], state.piles[bPileIndex]] = [bPile, aPile];
  return ["swapPiles", aPileIndex, bPileIndex];
}

function applyOpLogReverse() {
  const entry = state.opLog[state.opLogIndex - 1];
  if (!entry) return;
  
  invokeCommand(entry.reverse);
  state.active = entry.location.pileIndex;
  activePile.value.picked = entry.location.cardIndex;
  state.opLogIndex--;
}

function applyOpLogForward() {
  const entry = state.opLog[state.opLogIndex];
  if (!entry) return;

  state.active = entry.location.pileIndex;
  activePile.value.picked = entry.location.cardIndex;
  invokeCommand(entry.forward);
  state.opLogIndex++;
}

// Perform the operation requested by the Command.
function invokeCommand(cmd: Command) {
  const [opName, ...opArgs] = cmd;
  // If type checking has an error on this line, there probably exists an
  // operation in opsByName that does not return Command or void.
  const opFn: (...args: any[]) => Command | void = opsByName[opName];
  return opFn(...opArgs);
}

// Operations are actions on state, typically by the user. They return a
// reciprocable undo Command that restores any nontrivial state; if all
// modified state is trivial (like which card is picked) it returns void.
const opsByName = {
  pickCardLeft: () => activePile.value.pickCardClamped(activePile.value.picked - 1),
  pickCardRight: () => activePile.value.pickCardClamped(activePile.value.picked + 1),
  pickCardFirst: () => activePile.value.pickCardClamped(0),
  pickCardLast: () => activePile.value.pickCardClamped(activePile.value.cards.length - 1),

  movePickedCardToPile,
  discardPickedCard: () => movePickedCardToPile(null),

  openPickedCardPage: () => {
    if (pickedCard.value) open(pickedCard.value.url);
  },

  reverseCardsInPile,

  activatePileUp: () => void state.active--,
  activatePileDown: () => void state.active++,

  createPileUp: () => createPileAt(state.active),
  createPileDown: () => createPileAt(++state.active),
  removePile: (pileIndex: number) => void state.piles.splice(pileIndex, 1),

  swapPiles,
  swapActivePileUp: () => swapPiles(state.active, --state.active),
  swapActivePileDown: () => swapPiles(state.active, ++state.active),

  applyOpLogReverse,
  applyOpLogForward,
  irreversible: () => assert(false),
};

const rootKeyBindings: Record<string, Command> = {
  h: ["pickCardLeft"],
  j: ["activatePileDown"],
  k: ["activatePileUp"],
  l: ["pickCardRight"],

  K: ["swapActivePileUp"],
  J: ["swapActivePileDown"],

  "^": ["pickCardFirst"],
  $: ["pickCardLast"],

  "0": ["movePickedCardToPile", 0],
  "1": ["movePickedCardToPile", 1],
  "2": ["movePickedCardToPile", 2],
  "3": ["movePickedCardToPile", 3],
  "4": ["movePickedCardToPile", 4],
  "5": ["movePickedCardToPile", 5],
  "6": ["movePickedCardToPile", 6],
  "7": ["movePickedCardToPile", 7],
  "8": ["movePickedCardToPile", 8],
  "9": ["movePickedCardToPile", 9],

  Enter: ["openPickedCardPage"],
  d: ["discardPickedCard"],

  o: ["createPileDown"],
  O: ["createPileUp"],
  R: ["reverseCardsInPile"],

  u: ["applyOpLogReverse"],
  U: ["applyOpLogForward"],
};

function onKeydown(event: KeyboardEvent) {
  const forward = rootKeyBindings[event.key];
  if (!forward) return;

  const location = currentLocation.value;
  const reverse = invokeCommand(forward);
  if (reverse) {
    state.opLog.splice(state.opLogIndex);
    state.opLog[state.opLogIndex++] = { forward, reverse, location };
  }
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
