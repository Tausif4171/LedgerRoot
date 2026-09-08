import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { documentSchema } from "@ledgerroot/contracts";
const base = resolve("apps/web/public");
const manifest = z
  .array(documentSchema)
  .parse(JSON.parse(await readFile(`${base}/samples/manifest.json`, "utf8")));
for (const sample of manifest) {
  const filename = `/samples/${sample.id}-thumbnail.png`;
  await sharp(resolve(base, sample.sourceUrl.slice(1)))
    .resize({ width: 96, height: 128, fit: "inside" })
    .png()
    .toFile(`${base}${filename}`);
  sample.thumbnailUrl = filename;
}
await writeFile(`${base}/samples/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`Prepared ${manifest.length} small sample thumbnails; extraction results unchanged.`);
