<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch, watchEffect } from "vue";
import DetailsPane from "./components/DetailsPane.vue";
import PilesPane from "./components/PilesPane.vue";
import { Card, Pile, type CardData } from "./lib/types.ts";

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
});

const activePile = computed(() => state.piles[state.active]!);
const pickedCard = computed(() => activePile.value.cards?.[activePile.value.picked]);

// Bounds constrain active.
watchEffect(() => {
  if (state.active < 0) {
    state.active = 0;
  } else if (state.active >= state.piles.length) {
    state.active = state.piles.length - 1;
  }
});

const detailsElem = ref<HTMLElement>();

function scrollToActivePile() {
  activePile.value.elem?.scrollIntoView({ block: "nearest" });
}
watchEffect(scrollToActivePile);

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

function movePickedCardToPile(pileIndex: number | null) {
  if (!pickedCard.value) return;
  const targetPile = pileIndex == null ? null : state.piles[pileIndex];
  if (targetPile === undefined) return;

  viewTransition(() => {
    const card = activePile.value.cards.splice(activePile.value.picked, 1)[0]!;
    if (targetPile !== null) {
      targetPile.cards.push(card);
    }
    activePile.value.pickCardClamped(activePile.value.picked);
  });
}

function swapPiles(aPileIndex: number, bPileIndex: number) {
  const [aPile, bPile] = [state.piles[aPileIndex], state.piles[bPileIndex]];
  if (!aPile || !bPile) return;
  [state.piles[aPileIndex], state.piles[bPileIndex]] = [bPile, aPile];
}

const discardPickedCard = () => movePickedCardToPile(null);

const pickCardLeft = () => activePile.value.pickCardClamped(activePile.value.picked - 1);
const pickCardRight = () => activePile.value.pickCardClamped(activePile.value.picked + 1);
const pickCardFirst = () => activePile.value.pickCardClamped(0);
const pickCardLast = () => activePile.value.pickCardClamped(activePile.value.cards.length - 1);

const activatePileUp = () => state.active--;
const activatePileDown = () => state.active++;

const createPileUp = () => state.piles.splice(state.active, 0, new Pile());
const createPileDown = () => state.piles.splice(++state.active, 0, new Pile());

const swapActivePileUp = () => swapPiles(state.active, --state.active);
const swapActivePileDown = () => swapPiles(state.active, ++state.active);

const openPickedCardPage = () => {
  if (pickedCard.value) open(pickedCard.value.url);
};

const reverseActivePile = () => {
  activePile.value.cards.reverse();
  activePile.value.picked = activePile.value.cards.length - 1 - activePile.value.picked;
};

const rootKeyBindings: Record<string, () => void> = {
  h: pickCardLeft,
  j: activatePileDown,
  k: activatePileUp,
  l: pickCardRight,

  K: swapActivePileUp,
  J: swapActivePileDown,

  "^": pickCardFirst,
  $: pickCardLast,

  "0": () => movePickedCardToPile(0),
  "1": () => movePickedCardToPile(1),
  "2": () => movePickedCardToPile(2),
  "3": () => movePickedCardToPile(3),
  "4": () => movePickedCardToPile(4),
  "5": () => movePickedCardToPile(5),
  "6": () => movePickedCardToPile(6),
  "7": () => movePickedCardToPile(7),
  "8": () => movePickedCardToPile(8),
  "9": () => movePickedCardToPile(9),

  Enter: openPickedCardPage,
  d: discardPickedCard,

  o: createPileDown,
  O: createPileUp,
  R: reverseActivePile,
};

function onKeydown(event: KeyboardEvent) {
  rootKeyBindings[event.key]?.();
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
