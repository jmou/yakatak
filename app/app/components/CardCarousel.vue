<script setup lang="ts">
const { cards, pickedCardIndex } = defineProps<{
  cards: Card[];
  pickedCardIndex: number;
}>();

const emit = defineEmits<{
  pick: [cardIndex: number];
  autoScroll: [];
}>();
</script>

<template>
  <div class="carousel">
    <CardCarouselItem
      v-for="(card, cardIndex) in cards"
      :key="card.id"
      :card="card"
      :is-picked="cardIndex === pickedCardIndex"
      @pick="emit('pick', cardIndex)"
      @auto-scroll="emit('autoScroll')"
      v-on="{ focus: $attrs.onFocus }"
    />
  </div>
</template>

<style scoped>
.carousel {
  display: flex;
  overflow: auto;
  padding: 4px 0 2px;
  gap: 3px;

  --gutter-width: 5px;
  --scroll-shadow-width: 20px;
  scroll-behavior: smooth;
  scroll-padding: calc(var(--gutter-width) + 5px);
  scrollbar-width: none;

  > * {
    flex: none;
    width: 100px;

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
