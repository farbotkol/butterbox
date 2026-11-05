import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const preview = pathToFileURL(path.join(root, "branding/website/cafe-concepts/preview.html")).href;

for (const { name, width, height, dpr, expectedHero } of [
  { name: "small phone", width: 320, height: 740, dpr: 1, expectedHero: "hero-portrait" },
  { name: "phone", width: 390, height: 844, dpr: 2, expectedHero: "hero-portrait" },
  { name: "desktop", width: 1440, height: 900, dpr: 2, expectedHero: "hero-wide" },
]) {
  test(`imagery review renders and loads accessibly on ${name}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const failures = [];
    const externalRequests = [];
    page.on("requestfailed", (request) => failures.push(request.url()));
    page.on("request", (request) => {
      if (!request.url().startsWith("file:")) externalRequests.push(request.url());
    });

    await page.goto(preview, { waitUntil: "domcontentloaded" });
    const hero = page.locator(".hero img");
    const initial = await hero.boundingBox();
    await hero.evaluate((image) => image.decode());
    const loaded = await hero.boundingBox();
    expect(initial).not.toBeNull();
    expect(loaded).not.toBeNull();
    expect(Math.abs(initial.height - loaded.height)).toBeLessThanOrEqual(1);
    expect(await hero.getAttribute("fetchpriority")).toBe("high");
    expect(await hero.evaluate((image) => image.currentSrc)).toContain(`butterbox-${expectedHero}-`);
    expect(await hero.evaluate((image) => image.currentSrc)).toMatch(/\.avif$/);

    const images = page.locator("main img");
    expect(await images.count()).toBe(6);
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate((element) => element.decode());
      expect(await image.getAttribute("alt")).toMatch(/^AI-generated illustration/);
      expect(await image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0);
    }
    expect(await page.locator(".grid img[loading='lazy']").count()).toBe(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(failures).toEqual([]);
    expect(externalRequests).toEqual([]);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${name.replace(" ", "-")}.png`), fullPage: true });
    await context.close();
  });
}

test("JPEG fallbacks retain the appropriate phone and desktop crop", async ({ browser }) => {
  for (const { width, expectedHero } of [{ width: 390, expectedHero: "hero-portrait" }, { width: 1440, expectedHero: "hero-wide" }]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    await page.goto(preview);
    await page.locator(".hero picture").evaluate((picture) => {
      for (const source of picture.querySelectorAll('source[type="image/avif"], source[type="image/webp"]')) source.remove();
    });
    const hero = page.locator(".hero img");
    await expect.poll(() => hero.evaluate((image) => image.currentSrc)).toContain(`butterbox-${expectedHero}-`);
    await expect.poll(() => hero.evaluate((image) => image.currentSrc)).toMatch(/\.jpg$/);
    await hero.evaluate((image) => image.decode());
    expect(await hero.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    await context.close();
  }
});
