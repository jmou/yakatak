<script setup lang="ts">
import { useElementSize, useScroll } from "@vueuse/core";
import { computed, ref, watch } from "vue";

const { pile } = defineProps<{
  pile: Pile;
}>();

const carouselElem = ref<HTMLElement>();
const { width: carouselWidth } = useElementSize(carouselElem);
const { x: scrollX } = useScroll(carouselElem, { behavior: "instant" });

const gutterWidth = 5;
const scrollWidth = computed(() => carouselWidth.value - 2 * gutterWidth);

const cardWidth = 100;
const gap = 3;
const cardSpacing = cardWidth + gap;

const visibleStart = computed(() => Math.floor((scrollX.value - gutterWidth) / cardSpacing));
// Off-by-one to account for a possible partially visible card.
const visibleLength = computed(() => Math.ceil(scrollWidth.value / cardSpacing) + 1);

const overscan = 1;
const realStart = computed(() => Math.max(0, visibleStart.value - overscan));
const realEnd = computed(() =>
  Math.min(pile.cards.length, visibleStart.value + visibleLength.value + overscan),
);

watch(
  [() => pile.pickedCardIndex, carouselWidth],
  () => {
    const left = pile.pickedCardIndex * cardSpacing;
    const right = left + cardWidth + 2 * gutterWidth;
    if (scrollX.value > left) {
      scrollX.value = left;
    } else if (scrollX.value + carouselWidth.value < right) {
      scrollX.value = right - carouselWidth.value;
    }
  },
  // Scroll after rendering any placed cards.
  { flush: "post" },
);

const carouselStyle = computed(() => ({
  "--gutter-width": `${gutterWidth}px`,
  "--card-width": `${cardWidth}px`,
  "--gap": `${gap}px`,
}));
</script>

<template>
  <div ref="carouselElem" class="carousel" :style="carouselStyle">
    <div v-if="realStart > 0" class="spacer" :style="{ '--num-cards': realStart }"></div>
    <CardCarouselItem
      v-for="(card, i) in pile.cards.slice(realStart, realEnd)"
      :key="card.id"
      :card="card"
      :is-picked="realStart + i === pile.pickedCardIndex"
      @pick="pile.pickCardClamped(realStart + i)"
      v-on="{ focus: $attrs.onFocus }"
    />
    <div
      v-if="realEnd < pile.cards.length"
      class="spacer"
      :style="{ '--num-cards': pile.cards.length - realEnd }"
    ></div>
  </div>
</template>

<style scoped>
.carousel {
  display: flex;
  overflow: auto;
  padding: 4px 0 2px;
  gap: var(--gap);

  --scroll-shadow-width: 20px;
  scroll-behavior: smooth;
  scroll-padding: calc(var(--gutter-width) + 5px);
  scrollbar-width: none;

  > * {
    flex: none;
    width: var(--card-width);

    &:first-child {
      margin-left: var(--gutter-width);
    }
    &:last-child {
      margin-right: var(--gutter-width);
    }
  }

  &::before,
  &::after {
    content: "";
    display: block;
    flex: none;
    position: sticky;
    width: var(--scroll-shadow-width);
    --margin-adjustment: calc(-1 * (var(--scroll-shadow-width) + var(--gap)));
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
    margin-right: var(--margin-adjustment);
    background: radial-gradient(farthest-side at 0% 50%, #0005, #0003 50%, transparent);
    animation-range: var(--gutter-width) 30px;
  }
  &::after {
    right: 0;
    margin-left: var(--margin-adjustment);
    background: radial-gradient(farthest-side at 100% 50%, #0005, #0003 50%, transparent);
    animation-direction: reverse;
    animation-range: calc(100% - 30px) calc(100% - var(--gutter-width));
  }
}

.spacer {
  width: calc(var(--num-cards) * (var(--card-width) + var(--gap)) - var(--gap));
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
