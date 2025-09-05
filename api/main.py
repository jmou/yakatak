from pathlib import Path
from typing import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse
from pydantic import DirectoryPath, FilePath
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    deck_json_file: FilePath = Path("../state/deck.json")
    scrape_dir: DirectoryPath = Path("../state/scrape")


settings = Settings()
app = FastAPI()


@app.middleware("http")
async def cache_control_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/api/deck")
def get_deck() -> Response:
    return FileResponse(settings.deck_json_file, media_type="application/json")


@app.get("/api/scrapes/{scrape_id}/thumb")
def get_scrape_thumb(scrape_id: str) -> Response:
    image_path = settings.scrape_dir / scrape_id / "derived" / "thumb.png"
    return FileResponse(image_path, media_type="image/png")


@app.get("/api/scrapes/{scrape_id}/tiles/{tile_index}")
def get_scrape_tile(scrape_id: str, tile_index: int) -> Response:
    image_path = (
        settings.scrape_dir / scrape_id / "derived" / "tiles" / f"{tile_index}.png"
    )
    return FileResponse(image_path, media_type="image/png")
