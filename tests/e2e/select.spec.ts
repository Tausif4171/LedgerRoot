import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("custom dropdown supports keyboard, clearing, dialog focus and narrow reflow", async ({
  page,
}, testInfo) => {
  await page.goto("/documents/sample-01");
  await expect(
    page
      .getByRole("combobox", { name: "Demo actor (simulation only)" })
      .getByText("Sample bookkeeper", { exact: true }),
  ).toBeVisible();
  const type = page.getByRole("combobox", { name: "Document type", exact: true });
  await type.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("i");
  await expect(page.getByRole("option", { name: "Invoice", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(type).toContainText("Invoice");
  await expect(type).toBeFocused();
  await type.click();
  await expect(page.getByRole("option", { name: "Select type", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Clear selection", exact: true }).click();
  await expect(type).toContainText("Select type");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(type).toContainText("Select type");
  const currency = page.getByRole("combobox", { name: "Currency", exact: true });
  await currency.click();
  await expect(page.getByRole("option", { name: "Confirm currency", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "USD — US Dollar", exact: true }).click();
  await currency.click();
  await page.getByRole("option", { name: "Clear selection", exact: true }).click();
  await expect(currency).toContainText("Confirm currency");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(currency).toContainText("Confirm currency");

  await page.goto("/requests");
  await page.getByRole("button", { name: "Start correction scenario" }).click();
  await page.getByRole("button", { name: "Request information", exact: true }).click();
  const assignee = page.getByRole("combobox", { name: "Assign to", exact: true });
  await assignee.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(page.getByRole("listbox")).toBeVisible();
  // Full-page screenshots resize the viewport, which intentionally closes Radix Select.
  await page.screenshot({ path: testInfo.outputPath("dropdown-dialog.png") });
  await page.keyboard.press("Escape");
  await expect(assignee).toBeFocused();
  await expect(page.getByRole("dialog")).toBeVisible();
  const related = page.getByRole("combobox", { name: "Related field (optional)", exact: true });
  await related.click();
  await page.getByRole("option", { name: "Vendor", exact: true }).click();
  await related.click();
  await page.getByRole("option", { name: "Whole document", exact: true }).click();
  await expect(related).toContainText("Whole document");
  await page.setViewportSize({ width: 320, height: 760 });
  await related.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Request information", exact: true }),
  ).toBeFocused();
});
