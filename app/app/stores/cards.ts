export type CardLocation = readonly [pileIndex: number, cardIndex: number];

// The operation (or undo) log stores pairs of Commands that built up the
// current state or can be reversed in sequence to revert to a previous state.
interface OpLogEntry {
  forward: Command;
  reverse: Command;
  location: CardLocation;
}

export const useCardsStore = defineStore("cards", () => {
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
    pickedCard,
    state,
  };
});
