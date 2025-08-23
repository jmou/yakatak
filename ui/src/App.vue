<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, useTemplateRef, computed } from "vue";
import initialDeck from "../public/state/deck.json";

const deck = ref(initialDeck);

const selectedIndex = ref(deck.value.length - 1);

const selected = computed(() => deck.value[selectedIndex.value]);

const deckElem = useTemplateRef("deckElem");
const currElem = useTemplateRef("currElem");

function selectIndex(index: number) {
  selectedIndex.value = index;
  scrollToSelected();
  nextTick(() => currElem.value!.focus());
}

function selectNext() {
  selectIndex(Math.min(selectedIndex.value + 1, deck.value.length - 1));
}

function selectPrevious() {
  selectIndex(Math.max(selectedIndex.value - 1, 0));
}

// TODO animate
function deleteSelected() {
  if (deck.value.length <= 1) return;

  deck.value.splice(selectedIndex.value, 1);
  selectedIndex.value = Math.max(0, selectedIndex.value - 1);

  scrollToSelected();
}

function scrollToSelected(behavior: ScrollBehavior = "smooth") {
  const cardTop = selectedIndex.value * 80;
  const cardBottom = cardTop + 300;
  if (cardTop < deckElem.value!.scrollTop) {
    const top = Math.max(cardTop - 40, 0);
    deckElem.value!.scrollTo({ top, behavior });
  } else if (cardBottom > deckElem.value!.scrollTop + deckElem.value!.clientHeight) {
    const deckBottom = (deck.value.length - 1) * 80 + 300;
    const bottom = Math.min(cardBottom + 40, deckBottom);
    deckElem.value!.scrollTo({ top: bottom - deckElem.value!.clientHeight, behavior });
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "j") {
    selectNext();
  } else if (event.key === "k") {
    selectPrevious();
  } else if (event.key === "g") {
    // technically should be gg
    selectIndex(0);
  } else if (event.key === "G") {
    selectIndex(deck.value.length - 1);
  } else if (event.key === "h") {
    deckElem.value!.focus();
  } else if (event.key === "l") {
    currElem.value!.focus();
  } else if (event.key === "o") {
    open(selected.value.url);
  } else if (event.key === "d") {
    deleteSelected();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  scrollToSelected("instant");
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <main>
    <section ref="deckElem">
      <a
        :href="url"
        v-for="({ id, title, url }, index) in deck"
        :key="id"
        @click.exact.prevent="() => selectIndex(index)"
      >
        <div class="card" :class="{ selected: index === selectedIndex }">
          <div class="card-title">{{ title }}</div>
          <img :src="`/state/scrape/${id}/derived/thumb.png`" />
        </div>
      </a>
    </section>
    <section ref="currElem">
      <div class="meta">{{ selected.title }}<br />{{ selected.url }}</div>
      <img
        v-for="tileIndex in Array.from({ length: selected.numTiles }, (_, i) => i)"
        :key="tileIndex"
        :src="`/state/scrape/${selected.id}/derived/tiles/${tileIndex.toString()}.png`"
        loading="lazy"
      />
    </section>
  </main>
</template>

<style scoped>
main {
  display: flex;
  --selected-index: v-bind("selectedIndex");
}
section {
  height: 100vh;
  overflow: auto;
}

section:first-child {
  width: 600px;
}
.card {
  position: relative;
  height: 300px;
  margin-bottom: -220px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 2px solid #666;
  transform: translateY(2px);

  &:hover {
    transform: none;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  &.selected {
    margin-bottom: -20px;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
    transform: none;
  }

  > img {
    width: 100%;
  }

  .card-title {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(180deg, #444444cc 0%, #44444488 60%, transparent 100%);
    color: white;
    padding: 6px 8px 12px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  }
}

section:nth-child(2) {
  display: flex;
  flex-direction: column;
  scrollbar-gutter: stable;
  > img {
    width: 1024px;
    height: 1024px;
    &:last-child {
      height: auto;
    }
  }
}
.meta {
  position: fixed;
  bottom: 0;
  padding: 2px;
  background: #eee;
}
</style>
