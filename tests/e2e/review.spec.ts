import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("sample review edits persist, approval is explicit and reset is isolated", async ({
  page,
}) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1")) apiCalls.push(r.url());
  });
  await page.goto("/documents");
  const unknownTypeRow = page
    .locator("tr")
    .filter({ has: page.locator('a[href="/documents/sample-02"]') });
  await expect(unknownTypeRow).toContainText("Type needs review");
  await page.locator('a[href="/documents/sample-01"]').first().click();
  await page.getByLabel("Vendor", { exact: true }).fill("Cedar Field Supply");
  await page.getByLabel("Document date", { exact: true }).fill("2026-09-02");
  await page.getByLabel("Currency", { exact: true }).selectOption("USD");
  await page.getByLabel("Document type", { exact: true }).selectOption("receipt");
  await page.getByLabel("Total amount (USD)").fill("151.00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Total amount (USD)")).toHaveValue("151.00");
  await page.getByRole("button", { name: "Approve record", exact: true }).click();
  await expect(page.getByRole("alert").first()).toContainText("Confirm");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve record", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reopen for review" })).toBeVisible();
  await page.getByRole("button", { name: "Source found", exact: true }).first().click();
  await expect(page.locator(".evidence-highlight").first()).toBeVisible();
  await page.goto("/documents");
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.locator('a[href="/documents/sample-01"]').first().click();
  await expect(page.getByLabel("Total amount (USD)")).toHaveValue("148.50");
  expect(apiCalls).toEqual([]);
});
test("sample state is tab-local and supports 320px reduced-motion reflow", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/documents/sample-01");
  await page.getByLabel("Vendor", { exact: true }).fill("This tab only");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/documents/sample-01");
  await expect(other.getByLabel("Vendor", { exact: true })).not.toHaveValue("This tab only");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Source found", exact: true }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".evidence-highlight").first()).toBeVisible();
  await other.close();
});
test("sample failure and retry are visibly simulations", async ({ page }) => {
  await page.goto("/documents/sample-01");
  await page.getByRole("button", { name: "Simulate a processing failure", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Processing needs attention" })).toBeVisible();
  await page.getByRole("button", { name: "Replay simulated retry", exact: true }).click();
  await expect(page.getByLabel("Total amount (USD)")).toBeVisible();
});
test("accessibility: documents, review, dialog, quality and narrow reflow", async ({ page }) => {
  for (const route of ["/documents", "/documents/sample-01", "/quality"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    if (route === "/quality") {
      await expect(page.getByRole("heading", { name: "Extraction evaluation" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Evaluation", exact: true })).toBeVisible();
      await expect(page.getByText("Saved test results—not your workspace uploads.")).toBeVisible();
      await expect(page.getByText(/This recorded run contains 30 test cases/)).toBeVisible();
      await expect(page.locator("th", { hasText: /^Test case$/ })).toHaveCount(1);
    }
    await page.waitForTimeout(500);
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(report.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.goto("/documents");
  const trigger = page.getByRole("button", { name: "Try a sample", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
