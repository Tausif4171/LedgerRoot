import { test, expect } from "@playwright/test";

for (const activation of ["click", "Enter", "Space"] as const) {
  test(`approved source revision reopens once with ${activation}`, async ({ page }) => {
    await page.goto("/requests");
    await page.getByRole("button", { name: "Start correction scenario" }).click();
    await page.getByRole("button", { name: "Upload clearer photo", exact: true }).click();
    await page.getByLabel("What is clearer?").fill("Full receipt visible");
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button", { name: "Use supplied clearer photo" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "Discard draft and load saved values" }).click();
    await page.getByLabel("Vendor", { exact: true }).fill("Cedar Field Supply");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Approve record", exact: true }).click();
    const reopen = page.getByRole("button", { name: "Reopen for review", exact: true });
    await expect(reopen).toBeVisible();
    const before = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("ledgerroot-sample-v1")!).find(
        (d: { id: string }) => d.id === "correction-scenario",
      ),
    );
    if (activation === "click") await reopen.click();
    else {
      await reopen.focus();
      await page.keyboard.press(activation);
    }
    await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
    await expect(page.locator(".review-toast")).toContainText("Reopened for review.");
    const after = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("ledgerroot-sample-v1")!).find(
        (d: { id: string }) => d.id === "correction-scenario",
      ),
    );
    expect(after.revision).toBe(before.revision + 1);
    expect(
      after.history.slice(before.history.length).map((e: { action: string }) => e.action),
    ).toEqual(["reopen"]);
    expect(after.fields).toEqual(before.fields);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.locator(".review-toast")).toContainText("Review saved.");
  });
}
