class AssertionError extends Error {}

export function assert(expr: unknown): asserts expr {
  if (expr === false || expr === null || expr === undefined) {
    throw new AssertionError();
  }
}

export function checked<T>(value: T): NonNullable<T> {
  assert(value);
  return value;
}

export interface CardData {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly numTiles: number;
}

export class Card {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly numTiles: number;
  elem: Element | null = null;

  constructor(data: CardData) {
    this.id = data.id;
    this.url = data.url;
    this.title = data.title;
    this.numTiles = data.numTiles;
  }
}

export class Pile {
  name = "";
  cards: Card[] = [];
  pickedCardIndex = 0;
  elem: Element | null = null;

  static readonly DISCARD = 0;
  static readonly START = 1;

  constructor(data?: { name: string; cards: Card[]; pickedCardIndex: number }) {
    if (data) {
      this.name = data.name;
      this.cards = data.cards;
      this.pickedCardIndex = data.pickedCardIndex;
    }
  }

  pickCardClamped(cardIndex: number) {
    this.pickedCardIndex = Math.max(0, Math.min(cardIndex, this.cards.length - 1));
  }
}
