<script setup lang="ts">
import { ref, watch } from "vue";
import type { Card } from "../lib/types.ts";

interface Props {
  cards: Card[];
  picked: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  pick: [cardIndex: number];
  autoScroll: [];
}>();

const pickedCardElem = ref<Element>();

watch(
  () => props.picked,
  () => {
    if (pickedCardElem.value == null) return;
    // TODO use container: "nearest" to limit scrolling to the carousel
    pickedCardElem.value.scrollIntoView({ block: "nearest" });
    emit("autoScroll");
  },
  { flush: "post" },
);
</script>

<template>
  <div class="carousel">
    <a
      v-for="(card, cardIndex) in cards"
      :key="card.id"
      :href="card.url"
      class="card"
      :class="{ picked: cardIndex === picked }"
      :style="{ viewTransitionName: `card-${card.id.replace('.', '_')}` }"
      @click.exact.prevent="$emit('pick', cardIndex)"
      @focus="(event) => ($attrs.onFocus as any)(event)"
      :ref="(elem) => cardIndex === picked && (pickedCardElem = elem as Element)"
    >
      <img :src="`/api/scrapes/${card.id}/thumb`" :alt="card.title" :title="card.title" />
    </a>
  </div>
</template>

<style scoped>
.carousel {
  display: flex;
  overflow: auto;
  padding: 4px 0 2px;
  margin: 0 calc(-1 * var(--pile-padding));
  gap: 3px;

  --gutter-width: 5px;
  --scroll-shadow-width: 20px;
  scroll-behavior: smooth;
  scroll-padding: calc(var(--gutter-width) + 5px);
  scrollbar-width: none;
  &::before,
  &::after {
    content: "";
    display: block;
    flex: none;
    position: sticky;
    width: var(--scroll-shadow-width);
    z-index: 2;
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
    margin-right: calc(-1 * var(--scroll-shadow-width));
    background: radial-gradient(farthest-side at 0% 50%, #0005, #0003 50%, transparent);
    animation-range: var(--gutter-width) 30px;
  }
  &::after {
    right: 0;
    margin-left: calc(-1 * var(--scroll-shadow-width));
    background: radial-gradient(farthest-side at 100% 50%, #0005, #0003 50%, transparent);
    animation-direction: reverse;
    animation-range: calc(100% - 30px) calc(100% - var(--gutter-width));
  }
}

.card {
  display: block;
  flex: none;
  aspect-ratio: 5 / 7;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;

  transition: transform 0.15s ease;
  view-transition-class: card;

  &.picked {
    border-color: #666;
  }

  &:first-child {
    margin-left: var(--gutter-width);
  }
  &:last-child {
    margin-right: var(--gutter-width);
  }

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

/* If this is a single unnested selector, we lose the non-global portion;
   the nested selectors work as expected. */
:global(.selected) {
  .card.picked {
    border-color: #38f;
    outline: 3px solid #acf;
    /* This is not normally significant, but it paints view transitions above
       other cards. */
    z-index: 1;
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
