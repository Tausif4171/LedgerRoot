import { test, expect } from "@playwright/test";

test("workspace guidance and assignment placeholders remain clear at 320px", async ({
  page,
}, testInfo) => {
  await page.goto("/requests");
  await expect(page.getByText("Sample workspace", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Fieldwork & finances", { exact: true })).toHaveCount(0);
  await expect(page.locator(".avatar")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reset demo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start correction scenario" }).click();
  await page.getByRole("button", { name: "Request information", exact: true }).click();
  await page.getByRole("combobox", { name: "Assign to", exact: true }).click();
  await expect(page.getByRole("option", { name: "Choose teammate", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Sample teammate", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 760 });
  const actor = page.getByRole("combobox", { name: "Demo actor (simulation only)" });
  await actor.click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("narrow-actor-menu.png") });
  await page.keyboard.press("Escape");
  await page.screenshot({ path: testInfo.outputPath("narrow-workspace.png"), fullPage: true });
});
