import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("sample review edits persist, approval is explicit and reset is isolated", async ({
  page,
}) => {
  const apiCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/v1")) apiCalls.push(r.url());
  });
  await page.goto("/documents");
  const unknownTypeRow = page
    .locator("tr")
    .filter({ has: page.locator('a[href="/documents/sample-02"]') });
  await expect(unknownTypeRow).toContainText("Document type needs review");
  await page.locator('a[href="/documents/sample-01"]').first().click();
  await page.getByLabel("Vendor", { exact: true }).fill("Cedar Field Supply");
  await page.getByLabel("Document date", { exact: true }).fill("2026-09-02");
  await page.getByLabel("Currency", { exact: true }).click();
  await page.getByRole("option", { name: "USD — US Dollar", exact: true }).click();
  await page.getByLabel("Document type", { exact: true }).click();
  await page.getByRole("option", { name: "Receipt", exact: true }).click();
  await page.getByLabel("Total amount (USD)").fill("151.00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No value was extracted. The saved value was entered manually.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Original suggestion: $148.50.", { exact: true })).toBeVisible();
  const approvalNote =
    "Approval records your review in LedgerRoot. It does not create an accounting entry or send a payment.";
  await expect(page.getByText(approvalNote, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Total amount (USD)")).toHaveValue("151.00");
  await page.getByRole("button", { name: "Approve record", exact: true }).click();
  await expect(page.getByRole("alert").first()).toContainText("Confirm");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Approve record", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reopen for review" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText("Approved in LedgerRoot. Reopen to make changes.")).toBeVisible();
  await expect(page.getByText("Record approved.", { exact: true })).toHaveCount(0);
  await expect(page.getByText(approvalNote, { exact: true })).toHaveCount(0);
  const technicalDetails = page.locator("details.extraction-provenance");
  await expect(technicalDetails).toHaveCount(1);
  await expect(technicalDetails).not.toHaveAttribute("open", "");
  await expect(technicalDetails.locator("summary")).toHaveText("Technical details");
  const warnings = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Original extraction warnings" }) });
  await expect(warnings).toHaveCount(1);
  await expect(warnings).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Source found", exact: true }).first().click();
  await expect(page.locator(".evidence-highlight").first()).toBeVisible();
  await page.goto("/documents");
  await page.getByRole("button", { name: "Reset sample data", exact: true }).click();
  await page.locator('a[href="/documents/sample-01"]').first().click();
  await expect(page.getByLabel("Total amount (USD)")).toHaveValue("148.50");
  expect(apiCalls).toEqual([]);
});
test("sample state is tab-local and supports 320px reduced-motion reflow", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/documents/sample-01");
  await page.getByLabel("Vendor", { exact: true }).fill("This tab only");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Review saved.", { exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/documents/sample-01");
  await expect(other.getByLabel("Vendor", { exact: true })).not.toHaveValue("This tab only");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Source found", exact: true }).first().focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".evidence-highlight").first()).toBeVisible();
  await other.close();
});
test("sample failure and retry are visibly simulations", async ({ page }) => {
  await page.goto("/documents/sample-01");
  await page.getByText("Demo controls", { exact: true }).click();
  await page.getByRole("button", { name: "Simulate a processing failure", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Processing needs attention" })).toBeVisible();
  await page.getByRole("button", { name: "Replay simulated retry", exact: true }).click();
  await expect(page.getByLabel("Total amount (USD)")).toBeVisible();
});
test("accessibility: documents, review, dialog, quality and narrow reflow", async ({ page }) => {
  for (const route of ["/documents", "/documents/sample-01", "/quality"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    if (route === "/quality") {
      await expect(page.getByRole("heading", { name: "Extraction evaluation" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Evaluation", exact: true })).toBeVisible();
      await expect(
        page.getByText(
          /Saved evaluation results from 30 synthetic test documents with expected values/,
        ),
      ).toBeVisible();
      await expect(
        page.getByText("Unfilled candidate fields, including optional values"),
      ).toBeVisible();
      await expect(page.getByText("Processing errors", { exact: true })).toBeVisible();
      await expect(page.locator("th", { hasText: /^Test case$/ })).toHaveCount(1);
      await expect(page.getByRole("columnheader", { name: "Cases" })).toHaveCSS(
        "text-align",
        "left",
      );
      await expect(page.locator(".quality-table tbody td.quality-number").first()).toHaveCSS(
        "text-align",
        "left",
      );
      const metrics = page.locator(".quality-metrics-list");
      await expect(metrics.locator("dt")).toHaveCount(3);
      await expect(metrics.locator("dd").first()).toHaveText("92 / 210");
      await expect(page.locator(".quality-metric-table")).toHaveCount(0);
      const metricsBox = await metrics.boundingBox();
      expect(metricsBox).not.toBeNull();
      expect(metricsBox!.width).toBeLessThan(600);
    }
    await page.waitForTimeout(500);
    const report = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(report.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.goto("/documents");
  const trigger = page.getByRole("button", { name: "Try a sample", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("status-filter empty state gives one clear explanation and a way back", async ({ page }) => {
  await page.goto("/documents");
  await page.getByRole("button", { name: "Rejected", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No rejected documents", exact: true }),
  ).toBeVisible();
  const emptyState = page.locator(".empty-filter");
  await expect(emptyState).toBeVisible();
  const emptyTypography = await page.evaluate(() => {
    const title = document.querySelector<HTMLElement>(".empty-filter h2");
    const action = document.querySelector<HTMLElement>(".empty-filter .btn");
    return {
      titleSize: title ? getComputedStyle(title).fontSize : null,
      actionSize: action ? getComputedStyle(action).fontSize : null,
      actionHeight: action?.getBoundingClientRect().height ?? 0,
    };
  });
  expect(emptyTypography).toEqual({ titleSize: "16px", actionSize: "14px", actionHeight: 44 });
  await expect(page.getByText("No documents match this status.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Show all documents", exact: true }).click();
  await expect(page.getByRole("button", { name: "All documents", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".documents-table tbody tr")).toHaveCount(6);
});

test("core pages reflow without horizontal page overflow at target widths", async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/documents", "/documents/sample-01", "/requests", "/quality"]) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      const layout = await page.evaluate(() => ({
        viewport: innerWidth,
        page: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        containers: Array.from(
          document.querySelectorAll(
            ".shell, .sidebar, .content, .main, .toolbar, .filters, .search, .panel, .table-wrap",
          ),
        ).map((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            className: (element as HTMLElement).className,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: (element as HTMLElement).scrollWidth,
            overflowX: style.overflowX,
          };
        }),
        overflow: Array.from(document.body.querySelectorAll("*"))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              className: typeof element.className === "string" ? element.className : "",
              right: Math.round(rect.right),
              width: Math.round(rect.width),
            };
          })
          .filter((element) => element.right > innerWidth + 1)
          .sort((a, b) => b.right - a.right)
          .slice(0, 5),
      }));
      expect(
        layout.page <= layout.viewport,
        `${route} overflows at ${width}px: ${JSON.stringify(layout)}`,
      ).toBe(true);
    }
  }
});
