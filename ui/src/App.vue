<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  reactive,
  ref,
  useTemplateRef,
  watch,
  watchEffect,
} from "vue";
import CardCarousel from "./components/CardCarousel.vue";
import type { Card } from "./lib/types.ts";

class Pile {
  cards: Card[] = [];
  picked = 0;

  pickCardClamped(cardIndex: number) {
    this.picked = Math.max(0, Math.min(cardIndex, this.cards.length - 1));
  }
}

const loading = ref(true);
const error = ref<string | null>(null);

async function init() {
  try {
    const response = await fetch("/api/deck");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const cards: Card[] = await response.json();
    state.piles[0]!.cards = cards;
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
const pickedCard = computed(() => activePile.value.cards?.[activePile.value.picked]);

function moveCardToPile(pileIndex: number | null) {
  if (!pickedCard.value) return;
  if (pileIndex != null && state.piles[pileIndex] == null) return;

  const card = activePile.value.cards.splice(activePile.value.picked, 1)[0]!;
  if (pileIndex != null) {
    state.piles[pileIndex]!.cards.push(card);
  }

  if (activePile.value.picked >= activePile.value.cards.length) {
    activePile.value.picked = activePile.value.cards.length - 1;
  }
}

function discardCard() {
  moveCardToPile(null);
}

const detailsElem = useTemplateRef("detailsElem");
const activePileElem = ref<Element>();

function scrollToActivePile() {
  activePileElem.value?.scrollIntoView({ block: "nearest" });
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

function onKeydown(event: KeyboardEvent) {
  if (event.key === "h") {
    activePile.value.pickCardClamped(activePile.value.picked - 1);
  } else if (event.key === "l") {
    activePile.value.pickCardClamped(activePile.value.picked + 1);
  } else if (event.key === "H") {
    activePile.value.pickCardClamped(0);
  } else if (event.key === "L") {
    activePile.value.pickCardClamped(activePile.value.cards.length - 1);
  } else if (event.key === "j") {
    state.active = Math.min(state.active + 1, state.piles.length - 1);
  } else if (event.key === "k") {
    state.active = Math.max(state.active - 1, 0);
  } else if (event.key === "o") {
    if (pickedCard.value) open(pickedCard.value.url);
  } else if (event.key === "d") {
    viewTransition(discardCard);
  } else if (event.key >= "0" && event.key <= "9") {
    const pileIndex = parseInt(event.key);
    viewTransition(() => moveCardToPile(pileIndex));
  }
}

onMounted(async () => {
  await init();
  detailsElem.value!.focus();
});
</script>

<template>
  <main>
    <div ref="detailsElem" class="details" tabindex="0" @keydown="onKeydown">
      <div class="spacer"></div>
      <div v-if="loading" class="loading">Loading deck...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <template v-else-if="pickedCard">
        <div class="meta">{{ pickedCard.title }}<br />{{ pickedCard.url }}</div>
        <img
          v-for="tileIndex in Array.from({ length: pickedCard.numTiles }, (_, i) => i)"
          :key="tileIndex"
          :src="`/api/scrapes/${pickedCard.id}/tiles/${tileIndex}`"
          width="1024"
          :height="tileIndex < pickedCard.numTiles - 1 ? 1024 : undefined"
          loading="lazy"
        />
      </template>
    </div>
    <div class="piles" tabindex="-1" @focus="detailsElem!.focus()">
      <section
        :ref="(elem) => pileIndex == state.active && (activePileElem = elem as Element)"
        v-for="(pile, pileIndex) in state.piles"
        :key="pileIndex"
        :class="{ selected: pileIndex === state.active }"
        @click="state.active = pileIndex"
      >
        <header>{{ pileIndex }}</header>
        <CardCarousel
          :cards="pile.cards"
          :picked="pile.picked"
          @pick="(cardIndex) => pile.pickCardClamped(cardIndex)"
          @auto-scroll="scrollToActivePile"
        />
      </section>
    </div>
  </main>
</template>

<style scoped>
main {
  display: flex;
  height: 100vh;
}

.details {
  display: flex;
  flex-direction: column;
  border-right: 1px solid #ccc;
  overflow: auto;
  scrollbar-gutter: stable;
  scrollbar-color: #666 #eee;
  view-transition-name: details;

  /* We programatically focus the details pane, but don't emphasize it. */
  &:focus-visible {
    outline: none;
  }

  /* Keep the content from collapsing when no card is selected; we can't easily
     set the pane width directly without knowing the scrollbar width. */
  > .spacer {
    width: 1024px;
    height: 0;
  }

  > .meta {
    position: absolute;
    left: 0;
    bottom: 0;
    padding: 2px;
    border-top-right-radius: 8px;
    background: #eee;
    &:hover {
      opacity: 0.3;
    }
  }
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

  > section {
    --pile-padding: 5px;

    flex: none;
    height: 180px;
    padding: var(--pile-padding);
    padding-bottom: 0;
    border: 1px solid #ccc;
    border-radius: 6px;
    background: #eee;

    display: flex;
    flex-direction: column;

    &.selected {
      border-color: #888;
      outline: 3px solid #acf;
    }

    > header {
      font-weight: bold;
    }
  }
}

.loading,
.error {
  padding: 40px;
  text-align: center;
  font-size: 18px;
}

.loading {
  color: #666;
}

.error {
  color: #dc3545;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
}
</style>

<style>
:root {
  font-family: system-ui, Arial, Helvetica, sans-serif;
  font-size: 16px;
  background: #eee;
}
</style>
