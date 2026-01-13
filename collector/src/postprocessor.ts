import type { PostprocessJob, YakatakDb } from "@yakatak/db";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import sharp from "sharp";

const TILE_HEIGHT = 1024;
const THUMBNAIL_MAX_HEIGHT = 800;

async function createThumbnail(imagePath: string, outPath: string): Promise<void> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Failed to get image dimensions");
  }

  const cropHeight = Math.min(THUMBNAIL_MAX_HEIGHT, metadata.height);

  await image
    .extract({ left: 0, top: 0, width: metadata.width, height: cropHeight })
    .resize(Math.floor(metadata.width / 2), Math.floor(cropHeight / 2), {
      kernel: sharp.kernel.lanczos3,
    })
    .toFile(outPath);
}

async function createTiles(imagePath: string, tilesDir: string): Promise<string[]> {
  await fs.mkdir(tilesDir, { recursive: true });

  const image = sharp(imagePath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Failed to get image dimensions");
  }

  const { width, height } = metadata;
  const tilePaths: string[] = [];

  let i = 0;
  while (true) {
    const yLo = i * TILE_HEIGHT;
    const yHi = Math.min(yLo + TILE_HEIGHT, height);
    const tileHeight = yHi - yLo;

    const tilePath = path.join(tilesDir, `${i}.png`);

    await sharp(imagePath)
      .extract({ left: 0, top: yLo, width, height: tileHeight })
      .toFile(tilePath);

    tilePaths.push(tilePath);

    if (yHi >= height) break;
    i++;
  }

  return tilePaths;
}

export class Postprocessor {
  private db: YakatakDb;

  constructor(db: YakatakDb) {
    this.db = db;
  }

  async processJob(job: PostprocessJob): Promise<void> {
    const detailImagePath = job.detailImagePath;
    const outDir = path.join(path.dirname(detailImagePath), "derived");

    console.info(`Processing detail ${job.detailId} image ${detailImagePath}`);

    // Clean and recreate output directory
    try {
      await fs.rm(outDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore if directory doesn't exist
    }
    await fs.mkdir(outDir, { recursive: true });

    const thumbPath = path.join(outDir, "thumb.png");
    const tilesDir = path.join(outDir, "tiles");

    await createThumbnail(detailImagePath, thumbPath);
    const tilePaths = await createTiles(detailImagePath, tilesDir);

    this.db.savePostprocessedFiles(job.detailId, thumbPath, tilePaths);

    this.db.deletePostprocessJob(job.id);
  }
}
