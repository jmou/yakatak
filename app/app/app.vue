<script setup lang="ts">
import { whenever } from "@vueuse/core";

const cardsStore = useCardsStore();
const { state } = cardsStore;
const { activePile, currentLocation, pickedCard, status } = storeToRefs(cardsStore);

function scrollToActivePile() {
  activePile.value.elem?.scrollIntoView?.({ block: "nearest" });
}
watchEffect(scrollToActivePile);

const chooser = useTemplateRef("chooser");
const detailsElem = ref<HTMLElement>();

watch(pickedCard, () => (detailsElem.value!.scrollTop = 0));

const { data: deckData, pending, error } = useLazyFetch("/api/deck");
whenever(deckData, (deck) => {
  state.piles[1]!.cards = deck.map((data) => new Card(data));
});

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

  const ctx = { store: cardsStore, viewTransition, ask: chooser.value!.ask };
  const reverse = await invokeCommand(ctx, forward);

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

onMounted(() => detailsElem.value!.focus());
</script>

<template>
  <main>
    <DetailsPane
      v-model:elem="detailsElem"
      :pending
      :error
      :card="pickedCard"
      tabindex="0"
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
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
}

:root {
  font-family: system-ui, Arial, Helvetica, sans-serif;
  font-size: 16px;
  background: #eee;
}
</style>
