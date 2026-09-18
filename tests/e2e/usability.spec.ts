import { test, expect } from "@playwright/test";

test("source text is not presented as a supplied value when extraction abstains", async ({
  page,
}) => {
  await page.goto("/documents/sample-03");
  await expect(page.getByLabel("Vendor", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Document date", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: "View source text", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "View source text", exact: true }).first().click();
  await expect(page.locator(".evidence-highlight").first()).toBeVisible();
});

test("rejected records remain discoverable and can be reopened", async ({ page }) => {
  await page.goto("/documents/sample-01");
  await page.getByRole("button", { name: "Reject document", exact: true }).click();
  await page.getByLabel("Reason", { exact: true }).fill("Wrong document for this workspace");
  await page.getByRole("button", { name: "Save reason" }).click();
  await expect(page.getByText("Rejected in LedgerRoot. Reopen to make changes.")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.goto("/documents");
  await page.getByRole("button", { name: "Rejected", exact: true }).click();
  await expect(page.locator('a.doc-link[href="/documents/sample-01"]')).toBeVisible();
  await page.locator('a.doc-link[href="/documents/sample-01"]').click();
  await page.getByRole("button", { name: "Reopen for review" }).click();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeVisible();
});

test("history progressively reveals preserved events and needs-information explains visibility", async ({
  page,
}) => {
  await page.goto("/documents/sample-01");
  for (let i = 0; i < 6; i++) {
    await page.getByLabel("Vendor", { exact: true }).fill(`Saved vendor ${i}`);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
    await page.reload();
  }
  await expect(page.locator(".history-item")).toHaveCount(5);
  const historyTab = page.getByRole("tab", { name: "History", exact: true });
  if (await historyTab.isVisible()) await historyTab.click();
  await page.getByRole("button", { name: "Show 5 more" }).click();
  expect(await page.locator(".history-item").count()).toBeGreaterThan(5);
  await page.getByRole("button", { name: "Show fewer" }).click();
  await expect(page.locator(".history-item")).toHaveCount(5);
  const fieldsTab = page.getByRole("tab", { name: "Fields", exact: true });
  if (await fieldsTab.isVisible()) await fieldsTab.click();
  await page.getByRole("button", { name: "Needs information", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("No teammate is assigned");
});
