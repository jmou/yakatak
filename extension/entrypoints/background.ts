interface AddWindowEvent {
  type: "add window";
  windowId: number;
}

interface RemoveWindowEvent {
  type: "remove window";
  windowId: number;
}

interface DirtyWindowEvent {
  type: "dirty window";
  windowId: number;
}

interface ReconnectEvent {
  type: "reconnect";
}

interface SaveRevisionEvent {
  type: "save revision";
  windowId: number;
}

interface DeltaEventEvent {
  type: "delta event";
  delta: DeltaEvent;
}

interface ConnectionStatusEvent {
  type: "connection status";
  resolve: (value: boolean) => void;
}

type QueueableEvent =
  | AddWindowEvent
  | RemoveWindowEvent
  | DirtyWindowEvent
  | ReconnectEvent
  | SaveRevisionEvent
  | DeltaEventEvent
  | ConnectionStatusEvent;

class EventQueue {
  private queue: QueueableEvent[] = [];
  private resolve: ((value: QueueableEvent) => void) | null = null;

  push(event: QueueableEvent) {
    if (this.resolve) {
      this.resolve(event);
      this.resolve = null;
    } else {
      this.queue.push(event);
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<QueueableEvent, never, unknown> {
    while (true) {
      yield await new Promise<QueueableEvent>((resolve) => (this.resolve = resolve));
      yield* this.queue;
      this.queue = [];
    }
  }
}

interface WindowState {
  deckId?: number;
}

interface DeckState {
  windowId: number;
  revisionId: number;
}

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

async function handleDeltaEvent(delta: DeltaEvent): Promise<void> {
  const deck = await storage.getItem<DeckState>(`session:deck-${delta.deckId}`);
  if (!deck) throw new Error(`Unknown deck ${delta.deckId}`);
  if (delta.revisionId !== deck.revisionId) throw new Error(`Revision mismatch`);
  const windowId = deck.windowId;

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

async function processEvents(events: EventQueue) {
  let disconnect: (() => void) | null = null;

  for await (const event of events) {
    console.debug("Processing event", event);
    if (event.type === "add window") {
      const { id: deckId } = await api.createDeck();
      const { id: revisionId } = await saveWindowRevision(event.windowId, deckId);

      const win: WindowState = { deckId: deckId };
      await browser.storage.session.set({ [`window-${event.windowId}`]: win });
      const deck: DeckState = { revisionId, windowId: event.windowId };
      await browser.storage.session.set({ [`deck-${deckId}`]: deck });
    } else if (event.type === "remove window") {
      await browser.alarms.clear(`save-revision-${event.windowId}`);
      const win = await storage.getItem<WindowState>(`session:window-${event.windowId}`);
      if (!win) throw new Error("Window not present");
      await browser.storage.session.remove(`window-${event.windowId}`);
      if (win.deckId != null) {
        await browser.storage.session.remove(`deck-${win.deckId}`);
      }
    } else if (event.type === "dirty window") {
      const win = await storage.getItem<WindowState>(`session:window-${event.windowId}`);
      if (!win) continue;
      const name = `save-revision-${event.windowId}`;
      const existing = await browser.alarms.get(name);
      if (!existing) await browser.alarms.create(name, { delayInMinutes: 0.5 });
    } else if (event.type === "reconnect") {
      const keys = await browser.storage.session.getKeys();
      const deckKeys = keys.filter((k) => k.startsWith("deck-"));
      const decks = await browser.storage.session.get(deckKeys);
      const deckRevisions = Object.entries(decks).map(([key, { revisionId }]) => ({
        deckId: parseInt(key.replace("deck-", ""), 10),
        revisionId,
      }));

      if (disconnect) {
        disconnect();
        disconnect = null;
      }
      if (deckRevisions.length === 0) continue;

      disconnect = api.listenForDeltas(deckRevisions, (delta) =>
        events.push({ type: "delta event", delta }),
      );
    } else if (event.type === "save revision") {
      const win = await storage.getItem<WindowState>(`session:window-${event.windowId}`);
      if (win?.deckId == null) throw new Error("Cannot save unknown deck");
      await saveWindowRevision(event.windowId, win.deckId);
    } else if (event.type === "delta event") {
      await handleDeltaEvent(event.delta);
    } else if (event.type === "connection status") {
      event.resolve(disconnect != null);
    } else {
      const _: never = event;
      throw new Error("Unhandled event");
    }
  }
}

export default defineBackground({
  type: "module",
  persistent: false,
  main() {
    const events = new EventQueue();

    browser.tabs.onCreated.addListener((tab) =>
      events.push({ type: "dirty window", windowId: tab.windowId }),
    );
    browser.tabs.onRemoved.addListener((_tabId, { windowId }) =>
      events.push({ type: "dirty window", windowId }),
    );
    browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) =>
      events.push({ type: "dirty window", windowId: tab.windowId }),
    );
    // TODO how are cross-window moves represented?
    browser.tabs.onMoved.addListener((_tabId, { windowId }) =>
      events.push({ type: "dirty window", windowId }),
    );

    browser.windows.onRemoved.addListener((windowId) =>
      events.push({ type: "remove window", windowId }),
    );

    browser.storage.session.onChanged.addListener((changes) => {
      let reconnect = false;
      for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
        if (key.startsWith("window-")) {
          const windowId = parseInt(key.replace("window-", ""), 10);
          if (oldValue == null) {
            events.push({ type: "add window", windowId });
          } else if (newValue == null) {
            events.push({ type: "remove window", windowId });
          }
          reconnect = true;
        }
      }
      if (reconnect) events.push({ type: "reconnect" });
    });

    browser.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name.startsWith("save-revision-")) {
        const windowId = parseInt(alarm.name.replace("save-revision-", ""), 10);
        events.push({ type: "save revision", windowId });
      }
    });

    browser.runtime.onSuspend.addListener(() => console.log("Suspending"));

    onMessage(
      "getConnectionStatus",
      () => new Promise((resolve) => events.push({ type: "connection status", resolve })),
    );

    events.push({ type: "reconnect" });
    processEvents(events);
  },
});
