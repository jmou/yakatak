export type MaybePromise<T> = T | Promise<T>;

export interface CardData {
  readonly id: number;
  readonly url: string | null;
  readonly title: string | null;
  readonly numTiles: number;
}

interface PileData {
  name: string;
  cards: CardData[];
  pickedCardIndex: number;
  deckId?: number;
  revisionId?: number;
}

// TODO stop using snapshots
export interface Snapshot {
  piles: PileData[];
  activePileIndex: number;
  // The actual type depends on Command which is only defined in the client
  // cards store; it is not accessible here.
  opLog: unknown[];
}
