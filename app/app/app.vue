<script setup lang="ts">
import * as actions from "@/lib/actions";
import { useScroll } from "@vueuse/core";

const store = useCardsStore();

const chooser = useTemplateRef("chooser");
const detailsElem = ref<HTMLElement>();

const { y: scrollY } = useScroll(detailsElem);
const detailsIframe = ref(false);

watch(
  () => store.pickedCard,
  (newCard, oldCard) => {
    if (oldCard) oldCard.scrollY = scrollY.value;
    nextTick(() => (scrollY.value = newCard?.scrollY ?? 0));
  },
);

// TODO restore initial loading
const pending = ref(false);
const error = ref();

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

const ctx = computed<ActionContext>(() => ({
  store,
  revisionCache: new Map(),
  setStatus,
  ask: chooser.value!.ask,
  viewTransition,
}));

const rootKeyBindings: Readonly<Record<string, UserActionFn>> = {
  h: actions.pickCardLeft,
  j: actions.pickCardDown,
  k: actions.pickCardUp,
  l: actions.pickCardRight,

  H: actions.swapPickedCardLeft,
  J: actions.swapPickedCardDown,
  K: actions.swapPickedCardUp,
  L: actions.swapPickedCardRight,

  "^": actions.pickCardFirst,
  $: actions.pickCardLast,

  "1": actions.movePickedCardToPile(1),
  "2": actions.movePickedCardToPile(2),
  "3": actions.movePickedCardToPile(3),
  "4": actions.movePickedCardToPile(4),
  "5": actions.movePickedCardToPile(5),
  "6": actions.movePickedCardToPile(6),
  "7": actions.movePickedCardToPile(7),
  "8": actions.movePickedCardToPile(8),
  "9": actions.movePickedCardToPile(9),
  "0": actions.movePickedCardToPile(10),

  Enter: actions.openPickedCardPage,
  i: () => void (detailsIframe.value = !detailsIframe.value),
  d: actions.movePickedCardToPile(PILE_DISCARD),

  o: (ctx) => ["createPile", ctx.store.activePileIndex + 1],
  O: (ctx) => ["createPile", ctx.store.activePileIndex],
  n: actions.nameActivePile,
  g: actions.goToChosenPile,
  R: () => ["reverseCardsInPile"],
  e: actions.loadPileFromChosenDeck,

  s: actions.takeSnapshot,
  S: actions.restoreSnapshot,

  u: actions.applyOpLogReverse,
  U: actions.applyOpLogForward,
};

async function pushDelta(pile: Pile, card: Card | null, position: number, oldPosition?: number) {
  if (pile.deckId == null || pile.revisionId == null) return;
  const { deckId, revisionId } = pile;
  const body = { deckId, revisionId, position, oldPosition, cardId: card?.id };
  await $fetch(`/api/deltas`, {
    method: "POST",
    body,
  });
}

async function performLoggedCommand(forward: Command) {
  const location = store.currentLocation;

  // TODO less hacky way to determine whether to use a view transition
  const { reverse, revisions } =
    forward[0] === "moveCard"
      ? await viewTransition(() => invokeCommand(ctx.value, forward))
      : invokeCommand(ctx.value, forward);

  // TODO poor encapsulation
  if (forward[0] === "moveCard") {
    const sourcePile = checked(store.piles[forward[1][0]]);
    const targetPile = checked(store.piles[forward[2][0]]);
    const sourceCardIndex = forward[1][1];
    const targetCardIndex = forward[2][1];
    const card = checked(targetPile.cards[targetCardIndex]);
    if (sourcePile !== targetPile) {
      await pushDelta(sourcePile, null, sourceCardIndex);
      await pushDelta(targetPile, card, targetCardIndex);
    } else {
      await pushDelta(targetPile, card, targetCardIndex, sourceCardIndex);
    }
  }

  store.opLog.splice(store.opLogIndex);
  const entry: OpLogEntry = { forward, reverse, location };
  if (revisions.length > 0) entry.revisions = revisions;
  store.opLog[store.opLogIndex++] = entry;
}

// FIFO to serialize actions.
const pendingActions: UserActionFn[] = [];
let processingPromise: Promise<void> | null = null;

async function startActionProcessing() {
  while (true) {
    const actionFn = pendingActions.shift();
    if (!actionFn) break;
    try {
      const cmd = await actionFn(ctx.value);
      if (cmd) await performLoggedCommand(cmd);
    } catch (err) {
      setStatus("ERROR");
      throw err;
    }
  }
  processingPromise = null;
}

function dispatchAction(actionFn: UserActionFn) {
  pendingActions.push(actionFn);
  if (!processingPromise) processingPromise = startActionProcessing();
}

function onKeyDown(event: KeyboardEvent) {
  const actionFn = rootKeyBindings[event.key];
  if (actionFn) dispatchAction(actionFn);
}

provide("dispatchAction", dispatchAction);

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
        :iframe="detailsIframe"
        tabindex="0"
        @keydown="onKeyDown"
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
