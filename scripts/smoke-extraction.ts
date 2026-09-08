import { readFile } from "node:fs/promises";
import { readImage, extractFields } from "../apps/api/src/infrastructure/extraction.js";
const image = await readFile("apps/web/public/samples/sample-01.png");
const started = performance.now();
const { spans } = await readImage(image);
const result = await extractFields(spans);
console.log(
  JSON.stringify({
    provider: "real-local",
    spans: spans.length,
    totalCents: result.fields.totalCents,
    modelDigest: result.modelDigest,
    durationMs: Math.round(performance.now() - started),
  }),
);
