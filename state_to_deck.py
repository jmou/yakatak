import json
import sys
from pathlib import Path

deck = []
for statedir in sys.argv[1:]:
    statedir = Path(statedir)
    with open(statedir / "meta.json") as fh:
        meta = json.load(fh)
    try:
        with open(statedir / "derived" / "title.txt") as fh:
            title = fh.read()
    except FileNotFoundError:
        title = "(unknown)"
    num_tiles = sum(1 for _ in (statedir / "derived" / "tiles").iterdir())
    deck.append(
        {
            "id": statedir.name,
            "url": meta["url"],
            "title": title,
            "numTiles": num_tiles,
        }
    )
json.dump(deck, sys.stdout)
