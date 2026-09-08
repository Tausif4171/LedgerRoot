import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { environment } from "../apps/api/src/config/env.js";
environment();
const base = "http://127.0.0.1:3101";
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(`${base}/api/auth/sign-in/email`, {
    headers: { Origin: base },
    data: { email: process.env.SEED_EMAIL, password: process.env.SEED_PASSWORD },
  });
  if (!login.ok()) throw new Error(`Local sign-in failed (${login.status()}).`);
  const page = await context.newPage();
  await page.goto(`${base}/documents`);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  const names = [
    "sample-21.png",
    "sample-22.png",
    "sample-23.png",
    "sample-24.png",
    "sample-25.png",
  ];
  await page
    .getByLabel("Choose receipt or invoice images")
    .setInputFiles(names.map((name) => resolve("apps/web/public/samples", name)));
  await expect(
    page.getByText(/Saved · processing queued|Duplicate · existing record preserved/),
  ).toHaveCount(5, { timeout: 30000 });
  await page.screenshot({ path: "docs/demo/batch-upload.png", fullPage: true });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect
    .poll(
      async () => {
        const list = await (await context.request.get(`${base}/api/v1/documents`)).json();
        return list.items.filter(
          (d: { filename: string; stage: string }) =>
            names.includes(d.filename) && d.stage === "READY",
        ).length;
      },
      { timeout: 240000, intervals: [2000] },
    )
    .toBe(5);
  const list = await (await context.request.get(`${base}/api/v1/documents`)).json();
  await writeFile(
    "docs/demo/batch-verification.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        mode: "real-local",
        documents: list.items
          .filter((d: { filename: string }) => names.includes(d.filename))
          .map((d: { id: string; stage: string; filename: string }) => ({
            id: d.id,
            stage: d.stage,
            filename: d.filename,
          })),
      },
      null,
      2,
    ),
  );
  console.log("Five-file real upload/OCR/model batch completed.");
} finally {
  await browser.close();
}
