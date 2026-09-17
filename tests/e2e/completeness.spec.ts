import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("document list keeps status concise and total absence specific", async ({ page }) => {
  await page.route("**/samples/manifest.json", async (route) => {
    const response = await route.fetch();
    const documents = await response.json();
    const document = documents[0];
    document.stage = "READY";
    document.fields = {
      documentType: null,
      vendor: "Missing-field test",
      documentDate: "2026-09-02",
      totalCents: null,
      currency: null,
      invoiceNumber: null,
      dueDate: null,
    };
    await route.fulfill({ json: [document] });
  });
  await page.goto("/documents");
  // Mobile uses cards and deliberately hides the desktop table header.
  await expect(page.locator("thead th").nth(3)).toHaveText("Uploaded");
  await expect(page.getByRole("cell", { name: "Total not extracted", exact: true })).toBeVisible();
  const prefix = page.locator(".total-mobile-prefix");
  if ((page.viewportSize()?.width ?? 1280) > 760) await expect(prefix).toBeHidden();
  else await expect(prefix).toBeVisible();
  await expect(page.locator("tbody details")).toHaveCount(0);
  await expect(page.getByText(/required fields missing|Missing: Vendor/)).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(prefix).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
