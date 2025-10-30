interface WindowState {
  deckId: number;
  dirty: Ref<boolean>;
  deltas: Ref<DeltaEvent[]>;
  disconnect: Ref<(() => void) | undefined>;
}

const windows = new Map<number, WindowState>();

async function getWindowTabs(windowId: number) {
  const tabs = await browser.tabs.query({ windowId });
  const urls = tabs.map((tab) => tab.url || "");
  return { urls };
}

async function saveWindowRevision(windowId: number, deckId: number) {
  const data = await getWindowTabs(windowId);
  const result = await api.saveRevision(deckId, data);
  console.info(`Saved revision for window ${windowId} to deck ${deckId}`);
  return result;
}

function scheduleSaveRevision(windowId: number) {
  const win = windows.get(windowId);
  if (win) win.dirty.value = true;
}

async function enableSyncForWindow(windowId: number): Promise<void> {
  const deck = await api.createDeck();

  const dirty = ref(false);
  const deltas = ref<DeltaEvent[]>([]);
  const disconnect = ref<() => void>();
  const win: WindowState = { deckId: deck.id, dirty, deltas, disconnect };
  windows.set(windowId, win);

  // FIXME popup may not exist
  sendMessage("windowUpdated", windowId);
  watch([dirty, disconnect], () => sendMessage("windowUpdated", windowId));

  watchEffect(() => {
    if (!dirty.value) return;
    setTimeout(async () => {
      dirty.value = false;
      await saveWindowRevision(windowId, win.deckId);
    }, 10_000);
  });

  let processing = false;
  watch(
    deltas,
    async (deltas) => {
      if (processing) return;
      processing = true;
      let delta;
      while ((delta = deltas.shift())) {
        try {
          await handleDeltaEvent(windowId, delta);
        } catch (err) {
          if (disconnect.value) {
            disconnect.value();
            disconnect.value = undefined;
          }
          throw err;
        }
      }
      processing = false;
    },
    { deep: true },
  );

  const revision = await saveWindowRevision(windowId, deck.id);

  // TODO it seems like listening for deltas should not need saving a revision
  disconnect.value = api.listenForDeltas(deck.id, revision.id, (delta) => deltas.value.push(delta));
}

async function handleDeltaEvent(windowId: number, delta: DeltaEvent): Promise<void> {
  if (delta.type === "insert") {
    await browser.tabs.create({
      windowId,
      url: delta.url,
      index: delta.position,
      active: false,
    });
    console.info(`Opened tab in window ${windowId} at ${delta.position}`);
  } else {
    const tabs = await browser.tabs.query({ windowId });
    const tab = tabs[delta.position];
    if (!tab) throw Error("Missing tab");
    if (delta.type === "delete") {
      await browser.tabs.remove(tab.id!);
      console.info(`Closed tab in window ${windowId} at ${delta.position}`);
    } else if (delta.type === "move") {
      await browser.tabs.move(tab.id!, { index: delta.position });
      console.info(
        `Moved tab in window ${windowId} from ${delta.oldPosition} to ${delta.position}`,
      );
    }
  }
}

function handleWindowMutated(windowId: number) {
  scheduleSaveRevision(windowId);
}

function removeWindow(windowId: number) {
  const win = windows.get(windowId);
  if (!win?.disconnect?.value) return;
  win.disconnect.value();
  windows.delete(windowId);
  sendMessage("windowUpdated", windowId);
}

function queryWindows() {
  return [...windows.entries()].map(([id, win]) => ({
    id,
    connected: win.disconnect.value != null,
    dirty: win.dirty.value,
  }));
}

export default defineBackground({
  type: "module",
  main() {
    browser.tabs.onCreated.addListener((tab) => handleWindowMutated(tab.windowId));
    browser.tabs.onRemoved.addListener((_tabId, { windowId }) => handleWindowMutated(windowId));
    browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) =>
      handleWindowMutated(tab.windowId),
    );
    // TODO how are cross-window moves represented?
    browser.tabs.onMoved.addListener((_tabId, { windowId }) => handleWindowMutated(windowId));

    browser.windows.onRemoved.addListener(removeWindow);

    onMessage("enableSyncForWindow", ({ data: windowId }) => enableSyncForWindow(windowId));
    onMessage("disableSyncForWindow", ({ data: windowId }) => removeWindow(windowId));
    onMessage("queryWindows", queryWindows);
  },
});
