from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import DirectoryPath, FilePath
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    deck_json_file: FilePath = Path("../state/deck.json")
    scrape_dir: DirectoryPath = Path("../state/scrape")


settings = Settings()
app = FastAPI()


@app.get("/api/deck")
def get_deck():
    return FileResponse(settings.deck_json_file, media_type="application/json")


@app.get("/api/scrapes/{scrape_id}/thumb")
def get_scrape_thumb(scrape_id: str):
    image_path = settings.scrape_dir / scrape_id / "derived" / "thumb.png"
    return FileResponse(image_path, media_type="image/png")


@app.get("/api/scrapes/{scrape_id}/tiles/{tile_index}")
def get_scrape_tile(scrape_id: str, tile_index: int):
    image_path = (
        settings.scrape_dir / scrape_id / "derived" / "tiles" / f"{tile_index}.png"
    )
    return FileResponse(image_path, media_type="image/png")
