import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { arch, cpus, totalmem } from "node:os";
import { createHash } from "node:crypto";
import { z } from "zod";
import { documentSchema, fieldsSchema, fieldNames, type Evaluation } from "@ledgerroot/contracts";
import {
  readImage,
  extractFields,
  PROMPT_VERSION,
} from "../apps/api/src/infrastructure/extraction.js";
const data = z
  .object({
    version: z.string(),
    fixtures: z.array(
      z.object({
        id: z.string(),
        path: z.string(),
        split: z.string(),
        category: z.string(),
        expected: fieldsSchema,
        checksum: z.string(),
      }),
    ),
  })
  .parse(JSON.parse(await readFile("evals/fixtures.json", "utf8")));
const selected = data.fixtures.slice(
  0,
  process.env.EVAL_LIMIT ? Number(process.env.EVAL_LIMIT) : undefined,
);
const samples = z
  .array(documentSchema)
  .parse(JSON.parse(await readFile("apps/web/public/samples/manifest.json", "utf8")));
const report: Evaluation = {
  id: `eval-${Date.now()}`,
  createdAt: new Date().toISOString(),
  datasetVersion: data.version,
  model: process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
  modelDigest: "not-run",
  promptVersion: PROMPT_VERSION,
  hardware: `${arch()}; ${cpus()[0]?.model}; ${Math.round(totalmem() / 2 ** 30)} GiB RAM; first call may include cold model loading`,
  split: "all",
  cases: [],
};
await mkdir("evals/results", { recursive: true });
const hashes = new Map<string, string>();
const duplicates: Array<{ id: string; matches: string }> = [];
for (const fixture of selected) {
  const started = performance.now();
  const expectedCount = fieldNames.filter((k) => fixture.expected[k] !== null).length;
  try {
    const bytes = await readFile(resolve("apps/web/public/samples", fixture.path));
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (hashes.has(checksum)) duplicates.push({ id: fixture.id, matches: hashes.get(checksum)! });
    else hashes.set(checksum, fixture.id);
    const { normalized, spans } = await readImage(bytes);
    const result = await extractFields(spans);
    report.modelDigest = result.modelDigest;
    const sample = samples.find((s) => s.id === fixture.id);
    if (sample) {
      sample.extraction = result;
      sample.fields = result.fields;
      sample.history = [
        {
          id: `${fixture.id}-extracted`,
          at: new Date().toISOString(),
          actor: "Local processing worker",
          action: "Real extraction recorded",
          note: `${result.model}; ${result.promptVersion}`,
          before: null,
          after: result.fields,
        },
      ];
    }
    await writeFile(`evals/results/${fixture.id}.json`, JSON.stringify(result, null, 2));
    await writeFile(`apps/web/public/samples/${fixture.id}-normalized.png`, normalized);
    if (sample) sample.sourceUrl = `/samples/${fixture.id}-normalized.png`;
    const attempted = fieldNames.filter((k) => result.fields[k] !== null).length;
    const normalize = (v: unknown) =>
      typeof v === "string" ? v.toLowerCase().trim().replace(/\s+/g, " ") : v;
    const correct = fieldNames.filter(
      (k) =>
        fixture.expected[k] !== null &&
        normalize(result.fields[k]) === normalize(fixture.expected[k]),
    ).length;
    const unsupported = fieldNames.filter(
      (k) => fixture.expected[k] === null && result.fields[k] !== null,
    ).length;
    report.cases.push({
      id: fixture.id,
      category: `${fixture.split}/${fixture.category}`,
      expectedCount,
      attempted,
      correct,
      unsupported,
      durationMs: Math.round(performance.now() - started),
      error: null,
    });
    console.log(`${fixture.id}: ${correct}/${expectedCount} correct, ${attempted} attempted`);
  } catch (e) {
    report.cases.push({
      id: fixture.id,
      category: `${fixture.split}/${fixture.category}`,
      expectedCount,
      attempted: 0,
      correct: 0,
      unsupported: 0,
      durationMs: Math.round(performance.now() - started),
      error: e instanceof Error ? e.message : "Extraction failed",
    });
    console.log(`${fixture.id}: extraction failed`);
  }
  await writeFile(
    `evals/results/${report.id}.json`,
    JSON.stringify({ ...report, duplicates }, null, 2),
  );
  await writeFile("apps/web/public/samples/manifest.json", JSON.stringify(samples, null, 2));
  await writeFile("apps/web/public/samples/evaluations.json", JSON.stringify([report], null, 2));
}
console.log(
  `Saved ${report.cases.length} measured cases, ${duplicates.length} exact duplicate pairs. No production accuracy claim.`,
);
if (report.cases.some((c) => c.error)) process.exitCode = 1;
