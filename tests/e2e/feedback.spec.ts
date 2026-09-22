import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("review confirmations pause, dismiss, repeat, and preserve history", async ({
  page,
}, info) => {
  await page.goto("/documents/sample-01");
  await page.getByLabel("Vendor", { exact: true }).fill("Cedar Field Supply");
  const save = page.getByRole("button", { name: "Save changes", exact: true });
  await save.click();
  const toast = page.locator(".review-toast");
  await expect(toast).toHaveText(/Review saved\./);
  await expect(save).toBeFocused();
  await page.clock.install();
  await toast.hover();
  await page.clock.runFor(9000);
  await expect(toast).toBeVisible();
  await page.getByRole("button", { name: "Dismiss confirmation" }).focus();
  await page.mouse.move(0, 0);
  await page.clock.runFor(9000);
  await expect(toast).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(toast).toHaveCount(0);
  await save.click();
  await expect(toast).toHaveCount(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 320, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("toast-320.png"), fullPage: true });
  await page.clock.runFor(8100);
  await expect(toast).toHaveCount(0);
  await page.getByRole("button", { name: "Approve record", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(toast).toHaveCount(0);
});

test("brand icons load and sidebar retains only useful controls", async ({ page, request }) => {
  await page.goto("/documents");
  await expect(page.getByText("Independent prototype", { exact: true })).toHaveCount(0);
  const svg = await request.get("/icon.svg");
  expect(svg.ok()).toBe(true);
  expect(await svg.text()).toContain('viewBox="0 0 32 32"');
  const ico = await request.get("/favicon.ico");
  expect(ico.ok()).toBe(true);
  const bytes = await ico.body();
  expect(bytes.readUInt16LE(2)).toBe(1);
  expect(bytes.readUInt16LE(4)).toBe(3);
  await expect(page.locator('link[rel="icon"][href^="/icon.svg"]')).toHaveCount(1);
});
