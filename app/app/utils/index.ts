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

export class Pile {
  name = "";
  cards: Card[] = [];
  pickedCardIndex = 0;
  elem: Element | null = null;

  static readonly DISCARD = 0;
  static readonly START = 1;

  constructor(data?: PileData) {
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
