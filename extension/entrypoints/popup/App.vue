<script setup lang="ts">
import { useAsyncState } from "@vueuse/core";

const { state: activeWindowId } = useAsyncState(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.windowId;
}, undefined);

const { state: syncedWindowIds, executeImmediate: refreshWindowIds } = useAsyncState(async () => {
  const keys = await browser.storage.session.getKeys();
  return keys
    .filter((key) => key.startsWith("window-"))
    .map((key) => parseInt(key.replace("window-", ""), 10));
}, []);

const { state: dirtyWindowIds, executeImmediate: refreshDirtyWindowIds } =
  useAsyncState(async () => {
    const alarms = await browser.alarms.getAll();
    return alarms
      .filter((alarm) => alarm.name.startsWith("save-revision-"))
      .map((alarm) => parseInt(alarm.name.replace("save-revision-", ""), 10));
  }, []);

const windows = computed(() =>
  syncedWindowIds.value.map((id) => ({
    id,
    dirty: dirtyWindowIds.value.includes(id),
  })),
);

const { state: connected } = useAsyncState(() => sendMessage("getConnectionStatus"), false);

browser.storage.session.onChanged.addListener(refreshWindowIds);
browser.alarms.onAlarm.addListener(refreshDirtyWindowIds);

function enableSync(windowId: number) {
  browser.storage.session.set({ [`window-${windowId}`]: {} });
}

function disableSync(windowId: number) {
  browser.storage.session.remove(`window-${windowId}`);
}
</script>

<template>
  <template v-if="activeWindowId != null">
    <button v-if="syncedWindowIds.includes(activeWindowId)" @click="disableSync(activeWindowId)">
      Disable Sync
    </button>
    <button v-else @click="enableSync(activeWindowId)">Enable Sync</button>
  </template>
  <div>{{ connected ? "🟢 Connected" : "🔴 Disconnected" }}</div>
  <ul>
    <li
      v-for="win in windows"
      :key="win.id"
      :class="{ active: win.id === activeWindowId, dirty: win.dirty }"
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

  &::before {
    content: "🔄 ";
  }
  &:not(.dirty)::before {
    visibility: hidden;
  }
}
</style>
