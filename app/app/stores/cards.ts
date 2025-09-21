export type CardLocation = readonly [pileIndex: number, cardIndex: number];

// The operation (or undo) log stores pairs of Commands that built up the
// current state or can be reversed in sequence to revert to a previous state.
interface OpLogEntry {
  forward: Command;
  reverse: Command;
  location: CardLocation;
}

export const useCardsStore = defineStore("cards", () => {
  const piles = ref([new Pile(), new Pile()]);
  const activePileIndex = ref(Pile.START);
  const opLog = ref<OpLogEntry[]>([]);
  const opLogIndex = ref(0);

  const activePile = computed(() => checked(piles.value[activePileIndex.value]));
  const pickedCard = computed(() => activePile.value.cards[activePile.value.pickedCardIndex]);
  const currentLocation = computed<CardLocation>(() => [
    activePileIndex.value,
    activePile.value.pickedCardIndex,
  ]);

  // Bounds constrain activePileIndex.
  // TODO this could get watched more than once; use actions instead
  watchEffect(() => {
    if (activePileIndex.value < Pile.START) {
      activePileIndex.value = Pile.START;
    } else if (activePileIndex.value >= piles.value.length) {
      activePileIndex.value = piles.value.length - 1;
    }
  });

  return {
    // state
    piles,
    activePileIndex,
    opLog,
    opLogIndex,

    // getters
    activePile,
    pickedCard,
    currentLocation,
  };
});
