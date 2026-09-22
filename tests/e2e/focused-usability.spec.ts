import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";

test("empty extraction requires intentional manual review and keeps saved values", async ({
  page,
}, testInfo) => {
  const manifest = JSON.parse(readFileSync("apps/web/public/samples/manifest.json", "utf8"));
  const doc = manifest.find((d: { id: string }) => d.id === "sample-01");
  for (const key of Object.keys(doc.fields)) {
    doc.fields[key] = null;
    doc.extraction.fields[key] = null;
    doc.extraction.evidence[key] = [];
  }
  await page.route("**/samples/manifest.json", (route) => route.fulfill({ json: manifest }));
  await page.goto("/documents/sample-01");
  await expect(page.getByText("No receipt or invoice details were extracted.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).not.toBeVisible();
  await expect(page.getByLabel("Vendor", { exact: true })).not.toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("empty-review.png"), fullPage: true });
  await page.getByRole("button", { name: "Review manually", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Document type", exact: true })).toBeFocused();
  await page.getByLabel("Vendor", { exact: true }).fill("Verified vendor");
  await page.getByLabel("Demo actor (simulation only)").click();
  await page.getByRole("option", { name: "Sample teammate", exact: true }).click();
  await expect(page.getByLabel("Vendor", { exact: true })).toHaveValue("Verified vendor");
  await page.getByRole("button", { name: "Approve record", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Confirm the document type");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Vendor", { exact: true })).toHaveValue("Verified vendor");
  await expect(page.getByRole("button", { name: "Review manually", exact: true })).toHaveCount(0);
});

test("source placeholder is not an option and missing suggestions cannot erase saved values", async ({
  page,
}, testInfo) => {
  await page.goto("/requests");
  await page.getByRole("button", { name: "Start correction scenario" }).click();
  await page.getByLabel("Vendor", { exact: true }).fill("Cedar Field Supply");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
  const historyTab = page.getByRole("tab", { name: "History", exact: true });
  if (await historyTab.isVisible()) await historyTab.click();
  await page.getByRole("combobox", { name: "View a saved source" }).click();
  await expect(page.getByRole("option", { name: "Choose version", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Version 1 · current · Ready" }).click();
  const fieldsTab = page.getByRole("tab", { name: "Fields", exact: true });
  if (await fieldsTab.isVisible()) await fieldsTab.click();
  await page.getByRole("button", { name: "Upload clearer photo", exact: true }).click();
  await page.getByLabel("What is clearer?").fill("The full total is visible");
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Use supplied clearer photo" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Discard draft and load saved values" }).click();
  await page.getByText("Compare saved values with new suggestions", { exact: false }).click();
  const vendor = page
    .locator(".comparison-item")
    .filter({ has: page.locator("strong", { hasText: "Vendor" }) });
  await expect(vendor).toContainText("No new suggestion. Your saved value is kept.");
  await expect(vendor.getByRole("button")).toHaveCount(0);
  await expect(page.getByLabel("Vendor", { exact: true })).toHaveValue("Cedar Field Supply");
  await page.screenshot({ path: testInfo.outputPath("comparison.png"), fullPage: true });
});

test("sample history identifies each request action and actor", async ({ page }) => {
  await page.goto("/requests");
  await page.getByRole("button", { name: "Start correction scenario" }).click();
  async function create() {
    await page.getByRole("button", { name: "Request information", exact: true }).click();
    await page.getByLabel("Question", { exact: true }).fill("Please confirm vendor");
    await page.getByLabel("Assign to", { exact: true }).click();
    await page.getByRole("option", { name: "Sample teammate", exact: true }).click();
    await page.getByRole("button", { name: "Send request", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
  async function actor(name: string) {
    await page.getByLabel("Demo actor (simulation only)").click();
    await page.getByRole("option", { name, exact: true }).click();
  }
  const message = page.getByLabel("Response, follow-up, or cancellation reason");
  await create();
  await actor("Sample teammate");
  await message.fill("Cedar Field Supply");
  await page.getByRole("button", { name: "Send response", exact: true }).click();
  await actor("Sample bookkeeper");
  await message.fill("Please confirm spelling");
  await page.getByRole("button", { name: "Request more information", exact: true }).click();
  await actor("Sample teammate");
  await message.fill("Spelling confirmed");
  await page.getByRole("button", { name: "Send response", exact: true }).click();
  await actor("Sample bookkeeper");
  await page.getByRole("button", { name: "Resolve request", exact: true }).click();
  await expect(page.getByText("No active request.")).toBeVisible();
  await create();
  await page.getByLabel("Reassign to", { exact: true }).click();
  await page.getByRole("option", { name: "Sample bookkeeper", exact: true }).click();
  await page.getByRole("button", { name: "Reassign request", exact: true }).click();
  await message.fill("No longer needed");
  await page.getByRole("button", { name: "Cancel request", exact: true }).click();
  await expect(page.getByText("No active request.")).toBeVisible();
  const events = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("ledgerroot-sample-v1")!).find(
        (d: { id: string }) => d.id === "correction-scenario",
      ).history,
  );
  expect(events.map((e: { action: string }) => e.action)).toEqual(
    expect.arrayContaining([
      "Information requested",
      "Request respond",
      "Request follow-up",
      "Request resolve",
      "Request reassign",
      "Request cancel",
    ]),
  );
  expect(events.at(-1)).toMatchObject({ actor: "Sample bookkeeper", action: "Request cancel" });
  expect(events.at(-1).note).toContain("No longer needed");
  expect(events.some((e: { action: string }) => e.action === "Sample request updated")).toBe(false);
});

test("demo controls and header remain clear on narrow screens", async ({ page }, testInfo) => {
  await page.goto("/documents/sample-01");
  await expect(
    page.getByRole("button", { name: "Simulate a processing failure", exact: true }),
  ).not.toBeVisible();
  await page.setViewportSize({ width: 320, height: 760 });
  await expect(page.getByRole("combobox", { name: "Demo actor (simulation only)" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("header-320.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  const reset = page.getByRole("button", { name: "Reset samples", exact: true });
  await reset.hover();
  const colors = await reset.evaluate((el) => ({
    color: getComputedStyle(el).color,
    background: getComputedStyle(el).backgroundColor,
  }));
  expect(colors.color).not.toBe(colors.background);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("reset-hover.png") });
});

test("reopening a rejected record adds exactly one history event", async ({ page }) => {
  await page.goto("/documents/sample-01");
  await page.getByRole("button", { name: "Reject document", exact: true }).click();
  await page.getByLabel("Reason", { exact: true }).fill("Wrong image");
  await page.getByRole("button", { name: "Save reason" }).click();
  await expect(page.getByRole("heading", { name: "Document rejected" })).toBeVisible();
  const before = await page.evaluate(
    () =>
      JSON.parse(sessionStorage.getItem("ledgerroot-sample-v1")!).find(
        (d: { id: string }) => d.id === "sample-01",
      ).history.length,
  );
  await page.getByRole("button", { name: "Reopen for review" }).click();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
  const actions = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("ledgerroot-sample-v1")!)
      .find((d: { id: string }) => d.id === "sample-01")
      .history.map((e: { action: string }) => e.action),
  );
  expect(actions).toHaveLength(before + 1);
  expect(actions.at(-1)).toBe("reopen");
});
