import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { readImage, extractFields } from "../apps/api/src/infrastructure/extraction.js";
// Synthetic fixture generation. Both outputs are real local runs, not authored suggestions.
const original = await readFile("apps/web/public/samples/sample-01.png");
const metadata = await sharp(original).metadata();
const cropped = await sharp(original)
  .extract({ left: 0, top: 0, width: metadata.width!, height: Math.floor(metadata.height! * 0.6) })
  .png()
  .toBuffer();
const results = [];
for (const [name, bytes] of [
  ["correction-cropped", cropped],
  ["correction-clear", original],
] as const) {
  const { spans } = await readImage(bytes);
  const extraction = await extractFields(spans);
  await writeFile(`apps/web/public/samples/${name}.png`, bytes);
  results.push({ sourceUrl: `/samples/${name}.png`, extraction });
}
await writeFile(
  "apps/web/public/samples/correction-scenario.json",
  JSON.stringify(
    { recordedAt: new Date().toISOString(), initial: results[0], replacement: results[1] },
    null,
    2,
  ),
);
console.log("Recorded two synthetic-image extractions with model provenance.");
