<script setup lang="ts">
import { Pile } from "../lib/common.ts";
import CardCarousel from "./CardCarousel.vue";

interface Props {
  piles: Pile[];
}

const props = defineProps<Props>();

const active = defineModel("active");
</script>

<template>
  <div class="piles">
    <template v-for="(pile, pileIndex) in piles" :key="pileIndex">
      <section
        v-if="pileIndex >= Pile.START"
        :class="{ selected: pileIndex === active }"
        @click="active = pileIndex"
        :ref="(elem) => (pile.elem = elem as Element)"
      >
        <header>
          <span class="index">{{ pileIndex - Pile.START + 1 }}</span> {{ pile.name }}
        </header>
        <CardCarousel
          :cards="pile.cards"
          :pickedCardIndex="pile.pickedCardIndex"
          class="carousel"
          @pick="(cardIndex) => pile.pickCardClamped(cardIndex)"
          v-on="{ autoScroll: $attrs.onAutoScroll, focus: $attrs.onFocus }"
        />
      </section>
    </template>
  </div>
</template>

<style scoped>
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

  > header > .index {
    font-weight: bold;
    &::after {
      content: ".";
    }
  }

  > .carousel {
    margin: 0 calc(-1 * var(--pile-padding));
  }
}
</style>
