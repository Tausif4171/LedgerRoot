import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { environment } from "../apps/api/src/config/env.js";
environment();
const base = process.env.LIVE_DEMO_URL ?? "http://127.0.0.1:3101";
const directory = resolve("docs/demo");
await mkdir(directory, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: directory, size: { width: 1440, height: 1000 } },
});
const login = await context.request.post(`${base}/api/auth/sign-in/email`, {
  headers: { Origin: base },
  data: { email: process.env.SEED_EMAIL, password: process.env.SEED_PASSWORD },
});
if (!login.ok())
  throw new Error(`Local sign-in failed (${login.status()}); credentials were not logged.`);
const page = await context.newPage();
const stages = new Set<string>();
page.on("response", async (response) => {
  if (/\/api\/v1\/documents\/[^/?]+$/.test(response.url()) && response.ok()) {
    const value = await response.json().catch(() => null);
    if (value?.stage) stages.add(value.stage);
  }
});
await page.goto(`${base}/documents`);
await expect(page.getByRole("button", { name: "Upload", exact: true })).toBeVisible();
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "Upload", exact: true }).click();
await page
  .getByLabel("Choose receipt or invoice images")
  .setInputFiles(resolve("apps/web/public/samples/sample-01.png"));
await expect(
  page.getByText(/Saved · processing queued|Duplicate · existing record preserved/),
).toBeVisible({ timeout: 30000 });
await page.waitForTimeout(1800);
await page.getByRole("button", { name: "Done", exact: true }).click();
const documents = await (await context.request.get(`${base}/api/v1/documents`)).json();
const record = documents.items.find((d: { filename: string }) => d.filename === "sample-01.png");
if (!record) throw new Error("Upload not present in the persisted list.");
await page.goto(`${base}/documents/${record.id}`);
await expect(page.getByLabel("Vendor", { exact: true })).toBeVisible({ timeout: 240000 });
await page.screenshot({ path: `${directory}/live-review-before.png`, fullPage: true });
await page.waitForTimeout(3000);
const current = await (await context.request.get(`${base}/api/v1/documents/${record.id}`)).json();
if (current.reviewStatus === "APPROVED")
  await page.getByRole("button", { name: "Reopen for review" }).click();
await page.getByLabel("Vendor", { exact: true }).fill("Cedar Field Supply");
await page.getByLabel("Document type", { exact: true }).selectOption("receipt");
await page.getByLabel("Currency", { exact: true }).selectOption("USD");
await page.getByLabel("Document date", { exact: true }).fill("2026-09-02");
await page.getByLabel("Total amount (USD)").fill("148.50");
await page.getByRole("button", { name: "Save changes", exact: true }).click();
await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
await page.reload();
await expect(page.getByLabel("Vendor", { exact: true })).toHaveValue("Cedar Field Supply");
await page.waitForTimeout(2000);
await page.getByRole("checkbox").check();
await page.getByRole("button", { name: "Approve record", exact: true }).click();
await expect(page.getByRole("button", { name: "Reopen for review" })).toBeVisible();
await page.screenshot({ path: `${directory}/live-approved.png`, fullPage: true });
await page.getByRole("heading", { name: /History/i }).scrollIntoViewIfNeeded();
await page.waitForTimeout(2500);
await page.goto(`${base}/documents`);
await page.getByRole("button", { name: "Upload", exact: true }).click();
await page
  .getByLabel("Choose receipt or invoice images")
  .setInputFiles(resolve("apps/web/public/samples/sample-01.png"));
await expect(
  page.getByText("Duplicate · existing record preserved", { exact: true }),
).toBeVisible();
await page.waitForTimeout(2500);
await page.getByRole("button", { name: "Done", exact: true }).click();
await page.goto(`${base}/quality`);
await expect(page.getByRole("heading", { name: "Quality, made visible." })).toBeVisible();
await page.waitForTimeout(2500);
const saved = await (await context.request.get(`${base}/api/v1/documents/${record.id}`)).json();
const all = await (await context.request.get(`${base}/api/v1/documents`)).json();
expect(saved.reviewStatus).toBe("APPROVED");
expect(saved.extraction.provenance).toBe("live");
expect(all.items.filter((d: { id: string }) => d.id === record.id)).toHaveLength(1);
await writeFile(
  `${directory}/live-verification.json`,
  JSON.stringify(
    {
      at: new Date().toISOString(),
      documentId: record.id,
      observedStages: [...stages],
      model: saved.extraction.model,
      modelDigest: saved.extraction.modelDigest,
      promptVersion: saved.extraction.promptVersion,
      approval: saved.reviewStatus,
      revision: saved.revision,
      correctionsSurviveRefresh: true,
      duplicateResolvesSameDocument: true,
      note: "Actual local browser/API/storage/queue/OCR/model flow. Synthetic input only. No simulated inference.",
    },
    null,
    2,
  ),
);
const video = page.video();
await context.close();
await video?.saveAs(`${directory}/live-workflow.webm`);
await browser.close();
console.log("Real local workflow verified; recording and screenshots saved under docs/demo.");
