import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
const browser = await chromium.launch();
const reports = [];
await mkdir("docs/demo", { recursive: true });
try {
  for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const target = window as unknown as { measured: { lcp: number; cls: number } };
      target.measured = { lcp: 0, cls: 0 };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) target.measured.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) target.measured.cls += shift.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 1_600_000 / 8,
      uploadThroughput: 750_000 / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto("http://127.0.0.1:3100/documents");
    await page.locator('a[href="/documents/sample-01"]').first().waitFor();
    await page.waitForTimeout(5000);
    reports.push({
      run,
      ...(await page.evaluate(
        () => (window as unknown as { measured: { lcp: number; cls: number } }).measured,
      )),
    });
    if (run === 1) {
      await page.screenshot({ path: "docs/demo/sample-mobile.png", fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: "docs/demo/sample-desktop.png", fullPage: true });
    }
    await context.close();
  }
  const result = {
    at: new Date().toISOString(),
    browser: browser.version(),
    target: "local production sample build /documents",
    profile:
      "390x844; 4x CPU slowdown; 150ms network latency; 1.6Mbps down / 0.75Mbps up; disabled browser cache; 3 new contexts",
    limitations:
      "Local loopback server; not real-device field data or remote Vercel latency. CLS is summed no-input shifts during the sampled window, not a full-session field score.",
    runs: reports,
  };
  await writeFile("docs/performance.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
