import { refAutoReset, useFetch, whenever } from "@vueuse/core";

export type CardLocation = readonly [pileIndex: number, cardIndex: number];

// The operation (or undo) log stores pairs of Commands that built up the
// current state or can be reversed in sequence to revert to a previous state.
interface OpLogEntry {
  forward: Command;
  reverse: Command;
  location: CardLocation;
}

export const useCardsStore = defineStore("cards", () => {
  const getDeck = reactive(useFetch("/api/deck").json<CardData[]>());

  const listSnapshots = reactive(useFetch("/api/snapshots", { immediate: false }).json());
  const postSnapshotBody = ref<unknown | null>(null);
  const postSnapshot = reactive(
    useFetch("/api/snapshots", { immediate: false }).post(postSnapshotBody).json(),
  );
  const getSnapshotId = ref<string | null>(null);
  const getSnapshot = reactive(
    useFetch(() => `/api/snapshots/${getSnapshotId.value}`, { immediate: false }).json(),
  );

  const status = refAutoReset("", 5000);

  const state = reactive({
    piles: [new Pile(), new Pile()],
    activePileIndex: Pile.START,
    opLog: [] as OpLogEntry[],
    opLogIndex: 0,
  });

  const activePile = computed(() => checked(state.piles[state.activePileIndex]));
  const pickedCard = computed(() => activePile.value.cards[activePile.value.pickedCardIndex]);
  const currentLocation = computed<CardLocation>(() => [
    state.activePileIndex,
    activePile.value.pickedCardIndex,
  ]);

  whenever(
    () => getDeck.isFinished && !getDeck.error,
    () => {
      // TODO validate data
      assert(getDeck.data);
      state.piles[1]!.cards = getDeck.data.map((data) => new Card(data));
    },
  );

  // Bounds constrain active.
  watchEffect(() => {
    if (state.activePileIndex < Pile.START) {
      state.activePileIndex = Pile.START;
    } else if (state.activePileIndex >= state.piles.length) {
      state.activePileIndex = state.piles.length - 1;
    }
  });

  return {
    activePile,
    currentLocation,
    getDeck,
    getSnapshot,
    getSnapshotId,
    listSnapshots,
    pickedCard,
    postSnapshot,
    postSnapshotBody,
    state,
    status,
  };
});
