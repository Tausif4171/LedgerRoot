import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("request conflict refreshes without navigation or lost drafts", async ({ page }) => {
  await page.goto("/requests");
  await page.getByRole("button", { name: "Start correction scenario" }).click();
  await page.getByRole("button", { name: "Request information", exact: true }).click();
  await page.getByLabel("Question", { exact: true }).fill("Confirm vendor");
  await page.getByLabel("Assign to", { exact: true }).selectOption("sample-teammate");
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await page.getByLabel("Demo actor (simulation only)").selectOption("sample-teammate");
  await page
    .getByLabel("Response, follow-up, or cancellation reason")
    .fill("Confirmed from original");
  const fields = page.getByRole("tab", { name: "Fields", exact: true });
  if (await fields.isVisible()) await fields.click();
  await page.getByLabel("Vendor", { exact: true }).fill("Unsaved vendor correction");
  // Simulate a concurrent request update outside the React Query cache.
  await page.evaluate(() => {
    const key = "ledgerroot-collaboration-v1";
    const state = JSON.parse(sessionStorage.getItem(key)!);
    state.tasks[0].version++;
    sessionStorage.setItem(key, JSON.stringify(state));
  });
  await page.getByRole("button", { name: "Send response", exact: true }).click();
  await expect(page.getByText(/Latest details loaded/)).toBeVisible();
  await expect(page.getByLabel("Response, follow-up, or cancellation reason")).toHaveValue(
    "Confirmed from original",
  );
  await expect(page.getByLabel("Vendor", { exact: true })).toHaveValue("Unsaved vendor correction");
  await expect(page.getByText("Waiting for response", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Send response", exact: true }).click();
  await expect(page.getByText("Response needs review", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Resolve request", exact: true }).click();
  await expect(page.getByText("No active request.")).toBeVisible();
  await expect(page.getByLabel("Vendor", { exact: true })).toHaveValue("Unsaved vendor correction");
});

test("correction scenario preserves drafts and images, resolves then approves", async ({
  page,
}, testInfo) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1")) apiCalls.push(r.url());
  });
  await page.goto("/requests");
  await page.getByRole("button", { name: "Start correction scenario" }).click();
  await expect(page).toHaveURL(/correction-scenario/);
  await page.getByRole("button", { name: "Request information", exact: true }).click();
  await page.getByLabel("Question", { exact: true }).fill("Please provide a clearer total");
  await page.getByLabel("Assign to", { exact: true }).selectOption("sample-teammate");
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(page.getByText("Waiting for response", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve record", exact: true })).toBeDisabled();
  await page.getByLabel("Demo actor (simulation only)").selectOption("sample-teammate");
  await page.getByRole("button", { name: "Upload clearer photo", exact: true }).first().click();
  await page.getByLabel("What is clearer?").fill("The total is now visible");
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Use supplied clearer photo" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Response needs review", { exact: false })).toBeVisible();
  await page.getByLabel("Demo actor (simulation only)").selectOption("sample-bookkeeper");
  await page.getByRole("button", { name: "Resolve request", exact: true }).click();
  await expect(page.getByText("No active request.")).toBeVisible();
  const discard = page.getByRole("button", { name: "Discard draft and load saved values" });
  if (await discard.isVisible()) await discard.click();
  await page.getByLabel("Vendor", { exact: true }).fill("Cedar Field Supply");
  await page.getByLabel("Document date", { exact: true }).fill("2026-09-02");
  await page.getByLabel("Currency", { exact: true }).selectOption("USD");
  await page.getByLabel("Document type", { exact: true }).selectOption("receipt");
  await page.getByLabel("Total amount (USD)").fill("148.50");
  await page.getByRole("button", { name: "Upload clearer photo", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "You have unsaved changes" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Total amount (USD)")).toHaveValue("148.50");
  await page.getByLabel("I reviewed the document type", { exact: false }).check();
  await page.getByRole("button", { name: "Approve record", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reopen for review" })).toBeVisible();
  const historyTab = page.getByRole("tab", { name: "History", exact: true });
  if (await historyTab.isVisible()) await historyTab.click();
  await page.getByLabel("View a saved source").selectOption("sample-source-1");
  await expect(page.locator('img[src="/samples/correction-cropped.png"]')).toBeVisible();
  await page.getByLabel("View a saved source").selectOption("sample-source-2");
  await expect(page.locator('img[src="/samples/correction-clear.png"]').last()).toBeVisible();
  expect(apiCalls).toEqual([]);
  await page.screenshot({
    path: `test-results/correction-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 760 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("accessibility: requests and correction dialog", async ({ page }) => {
  await page.goto("/requests");
  await page.getByRole("button", { name: "Start correction scenario" }).click();
  await page.getByRole("button", { name: "Request information", exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Request information", exact: true }),
  ).toBeFocused();
});
