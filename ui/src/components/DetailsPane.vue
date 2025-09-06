<script setup lang="ts">
import type { Card } from "../lib/common.ts";

interface Props {
  loading: boolean;
  error: string | null;
  card: Card | undefined;
}

const props = defineProps<Props>();

const elem = defineModel("elem");
</script>

<template>
  <div ref="elem" class="details">
    <div class="spacer"></div>
    <div v-if="loading" class="loading">Loading deck...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="card">
      <div class="meta">{{ card.title }}<br />{{ card.url }}</div>
      <img
        v-for="tileIndex in Array.from({ length: card.numTiles }, (_, i) => i)"
        :key="tileIndex"
        :src="`/api/scrapes/${card.id}/tiles/${tileIndex}`"
        width="1024"
        :height="tileIndex < card.numTiles - 1 ? 1024 : undefined"
        loading="lazy"
      />
    </template>
  </div>
</template>

<style scoped>
.details {
  display: flex;
  flex-direction: column;
  border-right: 1px solid #ccc;
  overflow: auto;
  scrollbar-gutter: stable;
  scrollbar-color: #666 #eee;
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
