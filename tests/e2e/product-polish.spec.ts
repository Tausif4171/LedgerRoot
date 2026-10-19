import { test, expect } from "@playwright/test";

test("compact sample controls and page tools reflow at the supported widths", async ({
  page,
}, info) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/requests");
    await expect(
      page.locator("header").getByText(/Sample mode · Synthetic documents/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset demo", exact: true })).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: "View requests" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Search questions" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    if (width === 1440) {
      const filter = await page.getByRole("combobox", { name: "View requests" }).boundingBox();
      const search = await page.getByRole("textbox", { name: "Search questions" }).boundingBox();
      expect(Math.abs(filter!.y - search!.y)).toBeLessThan(2);
    }
    await page.screenshot({ path: info.outputPath(`requests-${width}.png`), fullPage: true });
    await page.goto("/documents");
    await page.locator('a[href="/documents/sample-01"]').first().waitFor();
    const baselines = await page
      .locator(".document-summary .stat-value")
      .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().y));
    expect(Math.max(...baselines) - Math.min(...baselines)).toBeLessThan(2);
    await page.goto("/quality");
    await expect(page.getByText(/Saved results from 30 synthetic test documents/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("region", { name: "Results by test case", exact: true }).focus();
    await expect(
      page.getByRole("region", { name: "Results by test case", exact: true }),
    ).toBeFocused();
    await page.screenshot({ path: info.outputPath(`evaluation-${width}.png`), fullPage: true });
  }
});

test("review focus stays visible and drafts survive responsive tab changes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/documents/sample-01");
  const vendor = page.getByRole("textbox", { name: "Vendor", exact: true });
  await vendor.fill("Unsaved draft");
  const invoice = page.getByRole("textbox", { name: "Invoice number (optional)", exact: true });
  await invoice.focus();
  const field = await invoice.boundingBox();
  const footer = await page.locator(".review-action-footer").boundingBox();
  expect(field!.y).toBeGreaterThanOrEqual(0);
  expect(field!.y + field!.height).toBeLessThanOrEqual(footer!.y);
  await page.setViewportSize({ width: 320, height: 760 });
  expect(
    await page.locator(".review-action-footer").evaluate((el) => getComputedStyle(el).position),
  ).toBe("static");
  await page.getByRole("tab", { name: "Source", exact: true }).click();
  await page.getByRole("tab", { name: "Fields", exact: true }).click();
  await expect(vendor).toHaveValue("Unsaved draft");
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toHaveCount(1);
});

test("request controls support 200% text without page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/requests");
  await expect(page.getByRole("button", { name: "Start correction example" })).toBeVisible();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
