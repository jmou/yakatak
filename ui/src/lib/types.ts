export interface CardData {
  id: string;
  url: string;
  title: string;
  numTiles: number;
}

export class Card {
  id: string;
  url: string;
  title: string;
  numTiles: number;
  elem: Element | null = null;

  constructor(data: CardData) {
    this.id = data.id;
    this.url = data.url;
    this.title = data.title;
    this.numTiles = data.numTiles;
  }
}

export class Pile {
  cards: Card[] = [];
  picked = 0;
  elem: Element | null = null;

  pickCardClamped(cardIndex: number) {
    this.picked = Math.max(0, Math.min(cardIndex, this.cards.length - 1));
  }
}
