# /// script
# dependencies = [
#     "pillow",
# ]
# ///

import os
import shutil
import sqlite3
import sys
from pathlib import Path

from PIL import Image
from PIL.ImageFile import ImageFile

# Allow reading extremely large images.
Image.MAX_IMAGE_PIXELS = None


def create_thumbnail(img: ImageFile, out_path: Path):
    cropped = img.crop((0, 0, img.width, min(800, img.height)))
    new_size = (cropped.width // 2, cropped.height // 2)
    thumb = cropped.resize(new_size, Image.Resampling.LANCZOS)
    thumb.save(out_path)


def create_tiles(img: ImageFile, tiles_dir: Path):
    TILE_HEIGHT = 1024
    width, height = img.size

    os.makedirs(tiles_dir, exist_ok=True)
    tile_files = []
    i = 0
    while True:
        y_lo = i * TILE_HEIGHT
        y_hi = min(y_lo + TILE_HEIGHT, height)
        tile = img.crop((0, y_lo, width, y_hi))
        path = tiles_dir / f"{i}.png"
        tile.save(path)
        tile_files.append(path)

        if y_hi >= height:
            break
        i += 1

    return tile_files


def process_from_database(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute(
        """
        UPDATE postprocess_job
        SET claimed_at = datetime('now'),
            claimed_by = ?
        WHERE id = (
            SELECT id FROM postprocess_job
            WHERE claimed_at IS NULL
            ORDER BY created_at
            LIMIT 1
        )
        RETURNING
            id,
            capture_id,
            (SELECT path FROM file WHERE file.id = (
                SELECT detail_image_file_id FROM capture WHERE capture.id = capture_id
            )) as detail_image_path
    """,
        ("derive.py",),
    )

    row = cursor.fetchone()
    if row is None:
        conn.close()
        return False

    job_id = row["id"]
    capture_id = row["capture_id"]
    detail_image_path = Path(row["detail_image_path"])
    conn.commit()

    print(f"Processing capture {capture_id} image {detail_image_path}")

    out_dir = detail_image_path.parent / "derived"
    try:
        shutil.rmtree(out_dir)
    except FileNotFoundError:
        pass
    os.makedirs(out_dir)

    thumb_path = out_dir / "thumb.png"
    tiles_dir = out_dir / "tiles"

    with Image.open(detail_image_path) as img:
        create_thumbnail(img, thumb_path)
        tile_files = create_tiles(img, tiles_dir)
        # TODO optipng

    cursor.execute("BEGIN")
    try:
        cursor.execute(
            """
            INSERT INTO file (path)
            VALUES (?)
            ON CONFLICT(path) DO UPDATE SET path = excluded.path
            RETURNING id
        """,
            (str(thumb_path),),
        )
        thumb_file_id = cursor.fetchone()["id"]

        cursor.execute(
            """
            INSERT INTO thumbnail (capture_id, file_id)
            VALUES (?, ?)
            ON CONFLICT(capture_id) DO UPDATE SET file_id = excluded.file_id
        """,
            (capture_id, thumb_file_id),
        )

        for tile_index, tile_path in enumerate(tile_files):
            cursor.execute(
                """
                INSERT INTO file (path)
                VALUES (?)
                ON CONFLICT(path) DO UPDATE SET path = excluded.path
                RETURNING id
            """,
                (str(tile_path),),
            )
            tile_file_id = cursor.fetchone()["id"]

            cursor.execute(
                """
                INSERT INTO tile (capture_id, tile_index, file_id)
                VALUES (?, ?, ?)
                ON CONFLICT(capture_id, tile_index) DO UPDATE SET file_id = excluded.file_id
            """,
                (capture_id, tile_index, tile_file_id),
            )

        cursor.execute("DELETE FROM postprocess_job WHERE id = ?", (job_id,))

        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    return True


def main():
    _, db_path = sys.argv
    while process_from_database(Path(db_path)):
        continue


if __name__ == "__main__":
    main()
