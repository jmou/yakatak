export interface Card {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly numTiles: number;
}

export interface Pile {
  name: string;
  cards: Card[];
  pickedCardIndex: number;
}

export interface Snapshot {
  piles: Pile[];
  activePileIndex: number;
  // The actual type depends on Command which is only defined in the client
  // cards store; it is not accessible here.
  opLog: unknown[];
}
