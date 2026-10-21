import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("supporting screens and loading skeletons reflow at the agreed widths", async ({
  page,
}, info) => {
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "Service temporarily unavailable." } },
    }),
  );
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
    await expect(page.locator("header")).toHaveCount(0);
    await page.getByLabel("Email", { exact: true }).focus();
    await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`login-${width}.png`), fullPage: true });
    await page.goto("/documents");
    await expect(page.getByRole("heading", { name: "Documents couldn’t load" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`recovery-${width}.png`), fullPage: true });
  }
  await page.unroute("**/api/v1/**");
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/**", async (route) => {
    await hold;
    await route.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "Unavailable." } },
    });
  });
  try {
    await page.goto("/documents");
    await expect(page.locator(".loading-state[role='status']")).toContainText("Loading documents…");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".skeleton")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath("loading-1440.png"), fullPage: true });
  } finally {
    release();
  }
});

test("signed-out Documents has one primary recovery action", async ({ page }) => {
  await page.route("**/api/v1/**", (route) =>
    route.fulfill({
      status: 401,
      json: { error: { code: "UNAUTHENTICATED", message: "Sign in." } },
    }),
  );
  await page.goto("/documents");
  await expect(
    page.locator("main").getByRole("link", { name: "Sign in", exact: true }),
  ).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await page.locator("main").getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Use your existing workspace account. Self-service sign-up isn’t available."),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

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
  await expect(page.getByRole("dialog")).toContainText(
    "Upload a photo or screenshot of a receipt or invoice.",
  );
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

test("duplicate upload links to the existing document without creating another", async ({
  page,
}) => {
  let uploads = 0;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST") {
      uploads += 1;
      return route.fulfill({ status: 200, json: { id: "existing-document", duplicate: true } });
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
  await page.locator("#upload-files").setInputFiles({
    name: "existing-receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from("duplicate UI test image"),
  });
  await expect(
    page.getByText("Already in this workspace. No new document was created.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open existing document", exact: true }),
  ).toHaveAttribute("href", "/documents/existing-document");
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  expect(uploads).toBe(1);
});
