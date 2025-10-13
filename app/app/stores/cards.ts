export type CardLocation = readonly [pileIndex: number, cardIndex: number];

// The operation (or undo) log stores pairs of Commands that built up the
// current state or can be reversed in sequence to revert to a previous state.
interface OpLogEntry {
  forward: Command;
  reverse: Command;
  location: CardLocation;
}

export const PILE_DISCARD = 0;
export const PILE_START = 1;

function newPile(): Pile {
  return { name: "", cards: [], pickedCardIndex: 0 };
}

export const useCardsStore = defineStore("cards", () => {
  const piles = ref([newPile(), newPile()]);
  const activePileIndex = ref(PILE_START);
  const opLog = ref<OpLogEntry[]>([]);
  const opLogIndex = ref(0);

  const activePile = computed(() => checked(piles.value[activePileIndex.value]));
  const pickedCard = computed(() => activePile.value.cards[activePile.value.pickedCardIndex]);
  const currentLocation = computed<CardLocation>(() => [
    activePileIndex.value,
    activePile.value.pickedCardIndex,
  ]);

  function insertPile(pileIndex: number) {
    piles.value.splice(pileIndex, 0, newPile());
  }

  function decrementActivePileIndex() {
    if (activePileIndex.value > PILE_START) activePileIndex.value--;
    return activePileIndex.value;
  }

  function incrementActivePileIndex() {
    if (activePileIndex.value + 1 < piles.value.length) activePileIndex.value++;
    return activePileIndex.value;
  }

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

    // actions
    insertPile,
    decrementActivePileIndex,
    incrementActivePileIndex,
  };
});
