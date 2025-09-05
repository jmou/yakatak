<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, useTemplateRef, watch } from "vue";

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
  detailsElem.value!.focus();
}

function pickNextCard() {
  pickCard(Math.min(activePile.value.picked + 1, activePile.value.cards.length - 1));
}

function pickPreviousCard() {
  pickCard(Math.max(activePile.value.picked - 1, 0));
}

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

function selectNextPile() {
  state.active = Math.min(state.active + 1, state.piles.length - 1);
}

function selectPreviousPile() {
  state.active = Math.max(state.active - 1, 0);
}

const activePileElem = ref<Element>();
const pickedCardElems = Array.from({ length: state.piles.length }, () => ref<Element>());

for (const source of pickedCardElems) {
  // TODO use container: "nearest" to limit scrolling to the carousel
  watch(source, (elem) => elem?.scrollIntoView({ block: "nearest" }));
}
// Without the above container option, this is fragile. Here we vertically
// scroll the piles pane, deliberately placing it after any carousel scrolling
// above by also watching pickedCardElems. This should correct any undesirable
// vertical scrolling caused by scrolling card carousels.
watch([activePileElem, ...pickedCardElems], ([elem]) => elem?.scrollIntoView({ block: "nearest" }));

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
      >
        <header>{{ pileIndex }}</header>
        <div class="carousel">
          <a
            :ref="
              (elem) =>
                cardIndex === pile.picked && (pickedCardElems[pileIndex]!.value = elem as Element)
            "
            v-for="(card, cardIndex) in pile.cards"
            :key="card.id"
            class="card"
            :class="{ picked: cardIndex === pile.picked }"
            :style="{ viewTransitionName: `card-${card.id.replace('.', '_')}` }"
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
  padding: 10px;
  overflow: auto;
  scroll-behavior: smooth;
  scroll-padding: 10px;

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

    scroll-behavior: smooth;
    scrollbar-width: none;
    --scroll-shadow-width: 15px;
    &::before,
    &::after {
      content: "";
      display: block;
      flex: none;
      position: sticky;
      width: calc(2 * var(--scroll-shadow-width));
      background: radial-gradient(farthest-side, rgb(0 0 0 / 0.25), rgb(0 0 0 / 0));
      z-index: 1;
      pointer-events: none;

      animation-name: reveal, detect-scroll;
      animation-timeline: scroll(x);
      animation-fill-mode: both;

      --visibility-if-can-scroll: var(--can-scroll) visible;
      --visibility-if-cant-scroll: hidden;
      visibility: var(--visibility-if-can-scroll, var(--visibility-if-cant-scroll));
    }
    &::before {
      left: 0;
      margin-right: calc(-2 * var(--scroll-shadow-width));
      transform: translateX(-50%);
      animation-range: 0 30px;
    }
    &::after {
      right: 0;
      margin-left: calc(-2 * var(--scroll-shadow-width));
      transform: translateX(50%);
      animation-direction: reverse;
      animation-range: calc(100% - 30px) calc(100%);
    }

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
    view-transition-class: card;
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

@keyframes reveal {
  from {
    opacity: 0;
  }
}

/* https://brm.us/css-can-scroll */
@keyframes detect-scroll {
  from,
  to {
    --can-scroll: ;
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
::view-transition-group(root) {
  animation-duration: 0s;
}

/* Workaround to prevent cards from painting over the details pane; not an
   actual transition. */
::view-transition-group(details) {
  animation-duration: 0s;
  z-index: 1;
}

@keyframes slide-up {
  to {
    opacity: 0;
    transform: translateY(-20%);
  }
}

::view-transition-old(.card):only-child {
  animation-name: slide-up;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(.card) {
    animation-duration: 0s;
  }
}
</style>
