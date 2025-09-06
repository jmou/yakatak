<script setup lang="ts">
import { toRef } from "vue";
import type { Pile } from "../lib/types.ts";
import CardCarousel from "./CardCarousel.vue";

interface Props {
  pile: Pile;
  pileIndex: number;
  isActive: boolean;
}

const props = defineProps<Props>();

const elem = toRef(props.pile, "elem");
</script>

<template>
  <section ref="elem" :class="{ selected: isActive }">
    <header>{{ pileIndex }}</header>
    <CardCarousel
      :cards="pile.cards"
      :picked="pile.picked"
      @pick="(cardIndex) => pile.pickCardClamped(cardIndex)"
      v-on="{ autoScroll: $attrs.onAutoScroll, focus: $attrs.onFocus }"
    />
  </section>
</template>

<style scoped>
section {
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
</style>
