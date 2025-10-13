<script setup lang="ts">
import { whenever } from "@vueuse/core";

const { card, isPicked } = defineProps<{
  card: Card;
  isPicked: boolean;
}>();

const elem = useTemplateRef("elem");

const emit = defineEmits<{
  pick: [];
  autoScroll: [];
}>();

whenever(
  () => isPicked,
  () => {
    // Typically scrollIntoView() affects all containing overflows. This
    // throws off vertical scrolling in the piles pane, so we resync on the
    // autoScroll event.
    //
    // The {container: "nearest"} option would change this to only affect
    // the carousel; we shouldn't need the autoScroll event then. As of
    // late 2025 it is just starting to see support in Chrome, but not yet
    // Firefox nor Safari.
    elem.value!.scrollIntoView({ block: "nearest", behavior: "instant" });
    emit("autoScroll");
  },
  { flush: "post" },
);
</script>

<template>
  <a
    ref="elem"
    :href="card.url"
    class="card"
    :class="{ picked: isPicked }"
    :style="{ viewTransitionName: `card-${card.id.replace('.', '_')}` }"
    @click.exact.prevent="emit('pick')"
  >
    <img :src="`/api/scrapes/${card.id}/thumb`" :alt="card.title" :title="card.title" />
  </a>
</template>

<style scoped>
.card {
  display: block;
  aspect-ratio: 5 / 7;
  border: 1px solid #ddd;
  border-radius: 6px;
  margin-top: var(--peek-height);
  opacity: 0.7;
  overflow: hidden;
  cursor: pointer;

  transition: transform 0.15s ease;
  view-transition-class: card;

  &.picked {
    border-color: #666;
    opacity: 1;
  }

  --peek-height: 2px;
  &:hover {
    transform: translateY(calc(-1 * var(--peek-height)));
    opacity: 1;
  }

  img {
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

::view-transition-old(.card):only-child,
::view-transition-new(.card):only-child {
  animation-name: slide-up;
}
::view-transition-new(.card):only-child {
  animation-direction: reverse;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(.card) {
    animation-duration: 0s;
  }
}
</style>
