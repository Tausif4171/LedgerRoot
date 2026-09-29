import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Repair only the known historical UTF-8/Latin-1 narrow-space corruption.
// Default is read-only. No broad encoding guesses or document-content changes.
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply"))
  throw new Error("Usage: tsx scripts/repair-filename-spacing.ts [--apply]");
const broken = "\u00e2\u0080\u00af";
const db = new PrismaClient();
try {
  const documents = await db.document.findMany({
    where: { filename: { contains: broken } },
    select: { id: true, filename: true },
  });
  const sources = await db.sourceRevision.findMany({
    where: { filename: { contains: broken } },
    select: { id: true, filename: true },
  });
  console.log(
    `Affected: ${documents.length} document names, ${sources.length} source-version names.`,
  );
  if (args.includes("--apply") && documents.length + sources.length > 0) {
    const backup = join(await mkdtemp(join(tmpdir(), "ledgerroot-filenames-")), "before.json");
    await writeFile(backup, JSON.stringify({ documents, sources }, null, 2), { mode: 0o600 });
    await db.$transaction(async (tx) => {
      for (const [model, rows] of [
        ["document", documents],
        ["sourceRevision", sources],
      ] as const) {
        for (const row of rows) {
          const result = await tx[model].updateMany({
            where: { id: row.id, filename: row.filename },
            data: { filename: row.filename.replaceAll(broken, "\u202f") },
          });
          if (result.count !== 1)
            throw new Error("Filename changed concurrently; repair rolled back.");
        }
      }
    });
    console.log(`Filename metadata repaired. Original names backed up at ${backup}`);
  }
} finally {
  await db.$disconnect();
}
