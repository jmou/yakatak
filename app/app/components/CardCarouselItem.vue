<script setup lang="ts">
const { card = null, isPicked = false } = defineProps<{
  card?: Card;
  isPicked?: boolean;
}>();

const emit = defineEmits<{
  pick: [];
}>();

const elem = useTemplateRef("elem");

const imgSrc = computed(() => (card ? `/api/scrapes/${card.id}/thumb` : undefined));

const style = computed(() => {
  if (!card) return undefined;
  return { viewTransitionName: `card-${card.id.replace(".", "_")}` };
});
</script>

<template>
  <a
    ref="elem"
    :href="card?.url"
    class="card"
    :class="{ picked: isPicked }"
    :style
    @click.exact.prevent="emit('pick')"
  >
    <img :src="imgSrc" :alt="card?.title" :title="card?.title" />
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
  /* CSS View Transitions Module Level 2 is not yet standardized, but nested
  view transition groups are implemented in Chrome. */
  view-transition-group: nearest;

  &.picked {
    border-color: #666;
    opacity: 1;
    /* Do not parent (nor clip) to the carousel, since the picked card may be
    moving between piles. */
    view-transition-group: normal;
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
