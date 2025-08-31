# /// script
# dependencies = [
#     "beautifulsoup4",
#     "pillow",
# ]
# ///

import base64
import json
import os
import shutil
import sys
import zipfile
from pathlib import Path

from bs4 import BeautifulSoup
from PIL import Image
from PIL.ImageFile import ImageFile

# Allow reading extremely large images.
Image.MAX_IMAGE_PIXELS = None


def read_from_har(zip_file: Path, url: str) -> bytes | None:
    with zipfile.ZipFile(zip_file) as zip:
        with zip.open("har.har") as har_fh:
            har = json.load(har_fh)

        for entry in har["log"]["entries"]:
            if entry["request"]["url"] != url:
                continue

            content = entry["response"]["content"]
            if "text" in content:
                if "encoding" in content:
                    if content["encoding"] == "base64":
                        return base64.b64decode(content["text"])
                    else:
                        raise Exception("unsupported encoding")
                else:
                    return content["text"].encode("utf-8")
            elif "_file" in content:
                return zip.read(content["_file"])
    return None


def parse_title(content: bytes):
    soup = BeautifulSoup(content, "html.parser")
    title = soup.find("title")
    return title.get_text().strip() if title else None


def create_title(scrape_dir: Path, out_path: Path):
    with open(scrape_dir / "meta.json") as fh:
        meta = json.load(fh)

    content = read_from_har(scrape_dir / "har.zip", meta["url"])
    if content is None:
        return
    title = parse_title(content)
    if title is None:
        return

    with open(out_path, "w") as fh:
        fh.write(title)


def create_thumbnail(img: ImageFile, out_path: Path):
    cropped = img.crop((0, 0, img.width, min(800, img.height)))
    new_size = (cropped.width // 2, cropped.height // 2)
    thumb = cropped.resize(new_size, Image.Resampling.LANCZOS)
    thumb.save(out_path)


def create_tiles(img: ImageFile, tiles_dir: Path):
    TILE_HEIGHT = 1024
    width, height = img.size

    os.makedirs(tiles_dir, exist_ok=True)
    i = 0
    while True:
        y_lo = i * TILE_HEIGHT
        y_hi = min(y_lo + TILE_HEIGHT, height)
        tile = img.crop((0, y_lo, width, y_hi))
        tile.save(tiles_dir / f"{i}.png")

        if y_hi >= height:
            break
        i += 1


def main():
    _, scrape_dir = sys.argv
    scrape_dir = Path(scrape_dir)

    out_dir = scrape_dir / "derived"
    try:
        shutil.rmtree(out_dir)
    except FileNotFoundError:
        pass
    os.makedirs(out_dir)

    create_title(scrape_dir, out_dir / "title.txt")
    with Image.open(scrape_dir / "w1024.png") as img:
        create_thumbnail(img, out_dir / "thumb.png")
        create_tiles(img, out_dir / "tiles")
    # TODO optipng


if __name__ == "__main__":
    main()
