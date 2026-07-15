import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public/logo.svg"));
const sizes = [16, 32, 48, 96, 128];

for (const size of sizes) {
  await sharp(svg, { density: 288 })
    .resize(size, size)
    .png()
    .toFile(join(root, "public/icon", `${size}.png`));
  console.log(`generated icon/${size}.png`);
}
