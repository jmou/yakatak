export interface DeltaEvent {
  id: number;
  deckId: number;
  revisionId: number;
  type: "insert" | "delete" | "move";
  position: number;
  oldPosition?: number;
  url?: string;
}

class Api {
  private apiBase = "http://localhost:3000";

  async saveRevision(deckId: number, data: { urls: string[] }): Promise<{ id: number }> {
    const response = await fetch(`${this.apiBase}/api/decks/${deckId}/revisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  async createDeck(): Promise<{ id: number }> {
    const response = await fetch(`${this.apiBase}/api/decks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }

  listenForDeltas(
    decks: { deckId: number; revisionId: number }[],
    onDelta: (delta: DeltaEvent) => void,
  ): () => void {
    const query = decks.map((d) => `${d.deckId}@${d.revisionId}`).join(",");
    const url = `${this.apiBase}/api/deltas?decks=${query}`;
    const events = new EventSource(url, { withCredentials: true });
    events.onopen = () => console.info(`Listening for deltas on decks ${query}`);
    events.onmessage = (event) => onDelta(JSON.parse(event.data) as DeltaEvent);
    events.onerror = () => console.error(`SSE error for deltas on decks ${query}`);
    return () => events.close();
  }
}

export const api = new Api();
