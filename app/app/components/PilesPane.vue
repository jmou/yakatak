<script setup lang="ts">
defineProps<{
  piles: Pile[];
}>();

const active = defineModel<number>("active");

const dispatchCommand = useDispatchCommand();

const activeElem = ref<HTMLElement>();
watchEffect(() => activeElem.value?.scrollIntoView({ block: "nearest" }));
</script>

<template>
  <div class="piles">
    <template v-for="(pile, pileIndex) in piles" :key="pileIndex">
      <section
        v-if="pileIndex >= PILE_START"
        :ref="(elem) => pileIndex === active && (activeElem = elem as HTMLElement)"
        :class="{ selected: pileIndex === active }"
        @click="active = pileIndex"
      >
        <header>
          <span class="index">{{ pileIndex - PILE_START + 1 }}</span> {{ pile.name }}
        </header>
        <CardCarousel
          :pile
          @pick="(cardIndex) => dispatchCommand(['pickCard', pileIndex, cardIndex])"
          v-on="{ focus: $attrs.onFocus }"
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
  flex: none;
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
    margin: 5px;
    margin-bottom: 0;
    > .index {
      font-weight: bold;
      &::after {
        content: ".";
      }
    }
  }
}
</style>
