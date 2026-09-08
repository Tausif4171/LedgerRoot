import { readFile } from "node:fs/promises";
import { z } from "zod";
import { evaluationSchema } from "@ledgerroot/contracts";
import { db } from "../apps/api/src/infrastructure/database.js";
import { json } from "../apps/api/src/modules/documents/service.js";
const reports = z
  .array(evaluationSchema)
  .parse(JSON.parse(await readFile("apps/web/public/samples/evaluations.json", "utf8")));
for (const report of reports) {
  await db.evaluationRun.upsert({
    where: { id: report.id },
    create: { id: report.id, payload: json(report) },
    update: {},
  });
}
await db.$disconnect();
console.log(`Imported ${reports.length} immutable recorded evaluation(s).`);
