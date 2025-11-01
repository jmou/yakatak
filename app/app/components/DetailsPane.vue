<script setup lang="ts">
defineProps<{
  pending: boolean;
  error: Error | undefined;
  card: Card | undefined;
}>();

const elem = defineModel<HTMLElement>("elem");
</script>

<template>
  <div ref="elem" class="details">
    <div class="spacer"></div>
    <div v-if="pending" class="pending">Loading deck...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else-if="card">
      <img
        v-for="tileIndex in Array.from({ length: card.numTiles }, (_, i) => i)"
        :key="tileIndex"
        :src="`/api/scrapes/${card.id}/tiles/${tileIndex}`"
        loading="lazy"
      />
    </template>
  </div>
</template>

<style scoped>
.details {
  display: flex;
  flex-direction: column;
  align-items: start;
  border-right: 1px solid #ccc;
  overflow: auto;
  scrollbar-gutter: stable;
  scrollbar-color: #666 #eee;

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

  > img {
    flex: none;
    max-width: 1024px;
    height: 1024px;
    &:last-child {
      height: auto;
    }
  }
}

.pending,
.error {
  padding: 40px;
  text-align: center;
  font-size: 18px;
}

.pending {
  color: #666;
}

.error {
  color: #dc3545;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
}
</style>
