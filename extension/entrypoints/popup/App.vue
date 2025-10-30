<script setup lang="ts">
import { useAsyncState } from "@vueuse/core";

const { state: activeWindowId } = useAsyncState(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.windowId;
}, undefined);

const { state: windows, executeImmediate } = useAsyncState(() => sendMessage("queryWindows"), []);

const activeWindow = computed(() => windows.value.find(({ id }) => id === activeWindowId.value));

onMessage("windowUpdated", () => {
  executeImmediate();
});
</script>

<template>
  <button v-if="activeWindow" @click="sendMessage('disableSyncForWindow', activeWindow.id)">
    Disable Sync
  </button>
  <button
    v-else-if="activeWindowId != null"
    @click="sendMessage('enableSyncForWindow', activeWindowId)"
  >
    Enable Sync
  </button>
  <ul>
    <li
      v-for="win in windows"
      :key="win.id"
      :class="{ active: win.id === activeWindowId, connected: win.connected, dirty: win.dirty }"
    >
      Window {{ win.id }}
    </li>
  </ul>
</template>

<style>
:root {
  width: 200px;
  font-size: 18px;
  font-family: system-ui;
}

* {
  font-family: inherit;
  font-size: inherit;
}
</style>

<style scoped>
h2 {
  font-size: 1.1rem;
  margin: 0;
}

button {
  width: 100%;
}

ul {
  margin: 0;
  padding: 0;
}

li {
  list-style: none;

  &.active {
    font-weight: bold;
  }

  &.connected::before {
    content: "🟢 ";
  }
  &:not(.connected)::before {
    content: "🔴 ";
  }

  &.dirty::after {
    content: " 🔄";
  }
}
</style>
