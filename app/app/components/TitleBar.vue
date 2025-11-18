<script setup lang="ts">
defineProps<{
  card: Card | undefined;
}>();
</script>

<template>
  <header>
    <div v-if="card">
      <div class="title">{{ card.title ?? "(unknown)" }}</div>
      <a v-if="card.url != null" :href="card.url">{{ card.url }}</a>
    </div>
  </header>
</template>

<style scoped>
header {
  display: flex;
  align-items: center;
  height: 4em;
  padding: 0 0.8em;
  background: linear-gradient(to bottom, #eee, #ddd);
  border-bottom: 1px solid #aaa;
  font-size: 90%;
}

.title {
  font-weight: bold;
  color: #333;
  cursor: default;
}

a {
  font-size: 90%;
  text-decoration: none;
  color: #666;
}
</style>
