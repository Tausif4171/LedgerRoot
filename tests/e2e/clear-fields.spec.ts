import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("clear controls preserve drafts and approval guards", async ({ page }, info) => {
  await page.goto("/documents/sample-01");
  await page.getByLabel("Vendor", { exact: true }).fill("Cedar Field Supply");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
  const before = await page.evaluate(() => sessionStorage.getItem("ledgerroot-sample-v1"));
  await page.setViewportSize({ width: 320, height: 760 });
  const clear = page.getByRole("button", { name: "Clear document type", exact: true });
  const size = await clear.boundingBox();
  expect(size!.height).toBeGreaterThanOrEqual(44);
  expect(size!.width).toBeGreaterThanOrEqual(44);
  await clear.hover();
  await expect(clear).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(clear).toHaveCSS("font-weight", "400");
  await expect(clear).toHaveCSS("text-decoration-line", "underline");
  await page.getByRole("combobox", { name: "Document type", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(clear).toBeFocused();
  await expect(clear).toHaveCSS("outline-style", "solid");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("clear-fields-320.png"), fullPage: true });
  await clear.click();
  expect(await page.evaluate(() => sessionStorage.getItem("ledgerroot-sample-v1"))).toBe(before);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve record", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen for review" })).toHaveCount(0);
  const type = page.getByRole("combobox", { name: "Document type", exact: true });
  await type.click();
  await page.getByRole("option", { name: "Receipt", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve record", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reopen for review" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Clear (document type|currency)$/ })).toHaveCount(
    0,
  );
});
