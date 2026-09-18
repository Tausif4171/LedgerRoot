import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("confirmed signed-out state provides a safe return to Requests", async ({ page }) => {
  let authenticated = false;
  await page.route("**/api/v1/**", async (route) => {
    if (!authenticated)
      return route.fulfill({
        status: 401,
        json: { error: { code: "UNAUTHENTICATED", message: "Sign in." } },
      });
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith("/me")
        ? { userId: "test", role: "OWNER" }
        : path.endsWith("/requests-summary")
          ? { actionable: 0 }
          : { items: [], nextCursor: null },
    });
  });
  await page.route("**/api/auth/sign-in/email", async (route) => {
    authenticated = true;
    await route.fulfill({ json: { user: { id: "test" } } });
  });
  await page.goto("/requests");
  await page.locator("header").getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email", { exact: true }).fill("test@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-only-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await expect(page.locator("header").getByRole("link", { name: "Sign in" })).toHaveCount(0);
});

test("service errors are not presented as sign-out", async ({ page }) => {
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "Service temporarily unavailable." } },
    }),
  );
  await page.goto("/documents");
  await expect(page.getByRole("heading", { name: "Documents couldn’t load" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
});

test("upload shows queued completion rather than an extraction progress bar", async ({
  page,
}, testInfo) => {
  const filename = "Screenshot 11.44.38\u202fPM.png";
  let multipart = "";
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") {
      multipart = route.request().postDataBuffer()?.toString("utf8") ?? "";
      return route.fulfill({ status: 202, json: { id: "uploaded", duplicate: false } });
    }
    return route.fulfill({
      json: path.endsWith("/me")
        ? { userId: "test", role: "OWNER" }
        : path.endsWith("/documents-summary")
          ? { total: 0, attention: 0, approved: 0 }
          : path.endsWith("/requests-summary")
            ? { actionable: 0 }
            : { items: [], nextCursor: null },
    });
  });
  await page.goto("/documents");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("English · USD · one document per image");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator("#upload-files").setInputFiles({
    name: filename,
    mimeType: "image/png",
    buffer: Buffer.from("mocked UI upload"),
  });
  await expect(page.getByText("Uploaded · processing queued", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open document", exact: true })).toBeVisible();
  expect(multipart).toContain('name="filename"');
  expect(multipart).toContain(filename);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("upload-complete.png"), fullPage: true });
});
