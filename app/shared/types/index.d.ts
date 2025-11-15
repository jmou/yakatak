export type MaybePromise<T> = T | Promise<T>;

export interface Card {
  readonly id: number;
  readonly url: string;
  readonly title: string;
  readonly numTiles: number;
  scrollY?: number;
}

export interface Pile {
  name: string;
  cards: Card[];
  pickedCardIndex: number;
  deckId?: number;
  revisionId?: number | null;
}

export interface Snapshot {
  piles: Pile[];
  activePileIndex: number;
  // The actual type depends on Command which is only defined in the client
  // cards store; it is not accessible here.
  opLog: unknown[];
}
