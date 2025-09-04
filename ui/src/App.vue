<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useTemplateRef } from "vue";

interface Card {
  id: string;
  url: string;
  title: string;
  numTiles: number;
}

interface Pile {
  cards: Card[];
  picked: number;
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
  piles: Array.from({ length: 10 }, () => ({ cards: [], picked: 0 }) as Pile),
  active: 0,
});

const activePile = computed(() => state.piles[state.active]!);
const pickedCard = computed(() => activePile.value.cards?.[activePile.value.picked]);

const detailsElem = useTemplateRef("detailsElem");

function pickCard(index: number) {
  activePile.value.picked = index;
  scrollToSelected();
  detailsElem.value!.focus();
}

function pickNextCard() {
  pickCard(Math.min(activePile.value.picked + 1, activePile.value.cards.length - 1));
}

function pickPreviousCard() {
  pickCard(Math.max(activePile.value.picked - 1, 0));
}

// TODO animate
function deleteCard() {
  if (activePile.value.cards.length <= 1) return;

  activePile.value.cards.splice(activePile.value.picked, 1);
  if (activePile.value.picked >= activePile.value.cards.length) {
    activePile.value.picked = activePile.value.cards.length - 1;
  }

  scrollToSelected();
}

function moveCardToPile(pileIndex: number) {
  if (!pickedCard.value || pileIndex < 0 || pileIndex >= state.piles.length) return;

  const card = activePile.value.cards.splice(activePile.value.picked, 1)[0]!;
  state.piles[pileIndex]!.cards.push(card);

  if (activePile.value.cards.length === 0) {
    activePile.value.picked = 0;
  } else {
    activePile.value.picked = Math.max(
      0,
      Math.min(activePile.value.picked, activePile.value.cards.length - 1),
    );
  }

  scrollToSelected();
}

// TODO scroll to active pile
function scrollToSelected(behavior: ScrollBehavior = "smooth") {
  nextTick(() =>
    document.querySelector(".card.picked")?.scrollIntoView({ block: "nearest", behavior }),
  );
}

function selectNextPile() {
  state.active = Math.min(state.active + 1, state.piles.length - 1);
  scrollToSelected();
}

function selectPreviousPile() {
  state.active = Math.max(state.active - 1, 0);
  scrollToSelected();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "h") {
    pickPreviousCard();
  } else if (event.key === "l") {
    pickNextCard();
  } else if (event.key === "H") {
    pickCard(0);
  } else if (event.key === "L") {
    pickCard(activePile.value.cards.length - 1);
  } else if (event.key === "j") {
    selectNextPile();
  } else if (event.key === "k") {
    selectPreviousPile();
  } else if (event.key === "o") {
    if (pickedCard.value) open(pickedCard.value.url);
  } else if (event.key === "d") {
    deleteCard();
  } else if (event.key >= "0" && event.key <= "9") {
    moveCardToPile(parseInt(event.key));
  }
}

onMounted(async () => {
  await init();
  detailsElem.value!.focus();
});
</script>

<template>
  <main>
    <div ref="detailsElem" class="details" tabindex="0" @keydown="handleKeydown">
      <div class="spacer"></div>
      <div v-if="loading" class="loading">Loading deck...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <template v-else-if="pickedCard">
        <div class="meta">{{ pickedCard.title }}<br />{{ pickedCard.url }}</div>
        <img
          v-for="tileIndex in Array.from({ length: pickedCard.numTiles }, (_, i) => i)"
          :key="tileIndex"
          :src="`/api/scrapes/${pickedCard.id}/tiles/${tileIndex}`"
          loading="lazy"
        />
      </template>
    </div>
    <div class="piles" tabindex="-1" @focus="detailsElem!.focus()">
      <section
        v-for="(pile, pileIndex) in state.piles"
        :key="pileIndex"
        :class="{ selected: pileIndex === state.active }"
      >
        <header>{{ pileIndex }}</header>
        <div class="carousel">
          <a
            v-for="(card, cardIndex) in pile.cards"
            :key="card.id"
            class="card"
            :class="{ picked: cardIndex === pile.picked }"
            :href="card.url"
            @click.exact.prevent="
              state.active = pileIndex;
              pickCard(cardIndex);
            "
          >
            <img :src="`/api/scrapes/${card.id}/thumb`" :alt="card.title" :title="card.title" />
          </a>
        </div>
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
  border-right: 1px solid #ddd;
  overflow: auto;
  scrollbar-gutter: stable;

  /* We programatically focus the details pane, but don't emphasize it. */
  &:focus-visible {
    outline: none;
  }

  > img {
    width: 1024px;
    height: 1024px;
    &:last-child {
      height: auto;
    }
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
  padding: 10px;
  overflow: auto;

  display: flex;
  flex-direction: column;
  gap: 20px;

  > section {
    flex: none;
    height: 180px;

    display: flex;
    flex-direction: column;

    > header {
      font-weight: bold;
    }
  }

  .carousel {
    display: flex;
    overflow: auto;
    padding: 4px 0 2px;

    > a.card {
      display: block;
      flex: none;
      aspect-ratio: 5 / 7;
      overflow: hidden;
      border-radius: 6px;
      cursor: pointer;
      transition: transform 0.15s ease;

      &:hover {
        transform: translateY(-2px);
      }

      img {
        /* Aim for ~20% of original scale. */
        height: 150px;
        /* Constrain to at least 2/3 of the original viewport height. */
        min-height: 100%;
        max-height: 150%;
      }
    }
  }

  .card {
    border: 2px solid transparent;
    &.picked {
      border-color: #888;
    }
  }
  .selected,
  .selected .card.picked {
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
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
