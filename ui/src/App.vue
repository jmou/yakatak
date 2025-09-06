<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch, watchEffect } from "vue";
import CardPile from "./components/CardPile.vue";
import DetailsPane from "./components/DetailsPane.vue";
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
  // TODO something better than statically allocated piles
  piles: Array.from({ length: 10 }, () => new Pile()),
  active: 0,
});

const activePile = computed(() => state.piles[state.active]!);
const activePickedCard = computed(() => activePile.value.cards?.[activePile.value.picked]);

function moveCardToPile(pileIndex: number | null) {
  if (!activePickedCard.value) return;
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

function discardCard() {
  moveCardToPile(null);
}

const detailsElem = ref<HTMLElement>();

function scrollToActivePile() {
  activePile.value.elem?.scrollIntoView({ block: "nearest" });
}
watchEffect(scrollToActivePile);

watch(activePickedCard, () => (detailsElem.value!.scrollTop = 0));

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

function onKeydown(event: KeyboardEvent) {
  if (event.key === "h") {
    activePile.value.pickCardClamped(activePile.value.picked - 1);
  } else if (event.key === "l") {
    activePile.value.pickCardClamped(activePile.value.picked + 1);
  } else if (event.key === "H" || event.key === "^") {
    activePile.value.pickCardClamped(0);
  } else if (event.key === "L" || event.key === "$") {
    activePile.value.pickCardClamped(activePile.value.cards.length - 1);
  } else if (event.key === "j") {
    state.active = Math.min(state.active + 1, state.piles.length - 1);
  } else if (event.key === "k") {
    state.active = Math.max(state.active - 1, 0);
  } else if (event.key === "o") {
    if (activePickedCard.value) open(activePickedCard.value.url);
  } else if (event.key === "d") {
    discardCard();
  } else if (event.key >= "0" && event.key <= "9") {
    moveCardToPile(parseInt(event.key));
  } else if (event.key === "R") {
    activePile.value.cards.reverse();
    activePile.value.picked = activePile.value.cards.length - 1 - activePile.value.picked;
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
      :card="activePickedCard"
      v-model:elem="detailsElem"
      tabindex="0"
      @keydown="onKeydown"
    />
    <div class="piles" tabindex="-1" @focus="detailsElem!.focus()">
      <CardPile
        v-for="(pile, pileIndex) in state.piles"
        :key="pileIndex"
        :pile
        :pile-index
        :is-active="pileIndex === state.active"
        @click="state.active = pileIndex"
        @auto-scroll="scrollToActivePile"
        @focus="detailsElem!.focus()"
      />
    </div>
  </main>
</template>

<style scoped>
main {
  display: flex;
  height: 100vh;
}

.piles {
  flex: 1;
  min-width: 300px;
  padding: 5px;
  background: #ddd;
  overflow: auto;
  scrollbar-color: #666 #ddd;
  scroll-behavior: smooth;
  scroll-padding: 10px;

  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>

<style>
:root {
  font-family: system-ui, Arial, Helvetica, sans-serif;
  font-size: 16px;
  background: #eee;
}
</style>
