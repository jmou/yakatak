export interface Card {
  id: string;
  url: string;
  title: string;
  numTiles: number;
}

export class Pile {
  cards: Card[] = [];
  picked = 0;
  elem: Element | null = null;

  pickCardClamped(cardIndex: number) {
    this.picked = Math.max(0, Math.min(cardIndex, this.cards.length - 1));
  }
}
