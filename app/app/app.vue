<script setup lang="ts">
import { useScroll, whenever } from "@vueuse/core";

const store = useCardsStore();

const chooser = useTemplateRef("chooser");
const detailsElem = ref<HTMLElement>();

const { y: scrollY } = useScroll(detailsElem);

watch(
  () => store.pickedCard,
  (newCard, oldCard) => {
    if (oldCard) oldCard.scrollY = scrollY.value;
    nextTick(() => (scrollY.value = newCard?.scrollY ?? 0));
  },
);

// TODO initialization is not safe with concurrent user actions
const { data: decksData, pending, error } = useLazyFetch("/api/decks");
whenever(decksData, async (decks) => {
  const piles = decks.map((deck) => ({
    name: `Deck ${deck.id}`,
    cards: [],
    pickedCardIndex: 0,
    deckId: deck.id,
    revisionId: null,
  }));

  store.piles.splice(1, 0, ...piles);

  await Promise.all(
    store.piles.entries().map(async ([i, pile]) => {
      if (pile.deckId) await invokeCommand(ctx.value, ["loadPileFromDeckRevision", i]);
    }),
  );
});

const status = ref("");
let statusTimer: ReturnType<typeof setTimeout> | null = null;

function setStatus(msg: string, options: { transient?: boolean } = {}) {
  const { transient = false } = options;

  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }

  status.value = msg;

  if (transient) {
    statusTimer = setTimeout(() => {
      status.value = "";
      statusTimer = null;
    }, 5000);
  }
}

async function viewTransition<T>(fn: () => T): Promise<T> {
  if (!document.startViewTransition) {
    return fn();
  } else {
    let result: T;
    await document.startViewTransition(() => {
      result = fn();
      return nextTick();
    }).updateCallbackDone;
    return result!;
  }
}

const ctx = computed<OperationContext>(() => ({
  store,
  setStatus,
  ask: chooser.value!.ask,
  viewTransition,
}));

const rootKeyBindings: Readonly<Record<string, Command>> = {
  h: ["pickCardLeft"],
  j: ["activatePileDown"],
  k: ["activatePileUp"],
  l: ["pickCardRight"],

  H: ["swapPickedCardWithNeighbor", "left"],
  K: ["swapActivePileUp"],
  J: ["swapActivePileDown"],
  L: ["swapPickedCardWithNeighbor", "right"],

  "^": ["pickCardFirst"],
  $: ["pickCardLast"],

  "1": ["movePickedCardToPile", 1],
  "2": ["movePickedCardToPile", 2],
  "3": ["movePickedCardToPile", 3],
  "4": ["movePickedCardToPile", 4],
  "5": ["movePickedCardToPile", 5],
  "6": ["movePickedCardToPile", 6],
  "7": ["movePickedCardToPile", 7],
  "8": ["movePickedCardToPile", 8],
  "9": ["movePickedCardToPile", 9],
  "0": ["movePickedCardToPile", 10],

  Enter: ["openPickedCardPage"],
  i: ["toggleIframeDetails"],
  d: ["discardPickedCard"],

  o: ["createPileDown"],
  O: ["createPileUp"],
  n: ["nameActivePile"],
  g: ["goToChosenPile"],
  R: ["reverseCardsInPile"],
  r: ["refreshActivePile"],

  s: ["takeSnapshot"],
  S: ["restoreSnapshot"],

  u: ["applyOpLogReverse"],
  U: ["applyOpLogForward"],
};

async function performLoggedCommand(forward: Command) {
  const location = store.currentLocation;

  const ctx = { store, setStatus, ask: chooser.value!.ask, viewTransition };
  const reverse = await invokeCommand(ctx, forward);

  if (reverse) {
    store.opLog.splice(store.opLogIndex);
    store.opLog[store.opLogIndex++] = { forward, reverse, location };
  }
}

// FIFO to serialize operations.
const pendingCommands: Command[] = [];
let processingPromise: Promise<void> | null = null;

async function startCommandProcessing() {
  while (true) {
    const cmd = pendingCommands.shift();
    if (!cmd) break;
    await performLoggedCommand(cmd);
  }
  processingPromise = null;
}

function dispatchCommand(cmd: Command) {
  pendingCommands.push(cmd);
  if (!processingPromise) processingPromise = startCommandProcessing();
}

function onKeydown(event: KeyboardEvent) {
  const cmd = rootKeyBindings[event.key];
  if (cmd) dispatchCommand(cmd);
}

provide("dispatchCommand", dispatchCommand);

onMounted(() => detailsElem.value!.focus());
</script>

<template>
  <main>
    <TitleBar :card="store.pickedCard" />
    <div class="panes">
      <DetailsPane
        v-model:elem="detailsElem"
        :pending
        :error
        :card="store.pickedCard"
        :iframe="store.iframeDetails"
        tabindex="0"
        @keydown="onKeydown"
      />
      <PilesPane
        v-model:active="store.activePileIndex"
        :piles="store.piles"
        tabindex="-1"
        @focus="detailsElem!.focus()"
      />
    </div>
    <div v-if="status" class="status">{{ status }}</div>
    <ChooserDialog ref="chooser" />
  </main>
</template>

<style scoped>
main {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.panes {
  display: flex;
  flex: 1;
  min-height: 0;
}

.status {
  position: fixed;
  bottom: 0;
  right: 0;
  padding: 2px;
  background: #eee;
  border: 1px 0 0 1px solid #888;
}
</style>

<style>
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
}

:root {
  font-family: system-ui, Arial, Helvetica, sans-serif;
  font-size: 14px;
  background: #eee;
}
</style>

<style>
/* Transition unnamed elements (like the details pane) instantly. */
::view-transition-group(root) {
  animation: none;
}
</style>
