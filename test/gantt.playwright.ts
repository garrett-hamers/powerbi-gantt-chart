import { expect, Page, test } from "@playwright/test";

const BASE = "http://localhost:9222/test/visual-harness.html";

async function waitForRender(page: Page): Promise<void> {
    await page.waitForSelector("body[data-rendered='true']", { timeout: 10000 });
    await expect(page.locator("body")).toHaveAttribute("data-renderer", "production-visual");
}

test.describe("production Gantt visual", () => {
    test("renders the standard scenario with production styles", async ({ page }) => {
        await page.goto(`${BASE}?scenario=standard`);
        await waitForRender(page);

        await expect(page.locator(".gantt-root")).toHaveCount(1);
        await expect(page.locator("#visual-container")).toHaveScreenshot("gantt-standard.png");
    });

    test("renders the multi-team scenario", async ({ page }) => {
        await page.goto(`${BASE}?scenario=multiTeam`);
        await waitForRender(page);

        await expect(page.locator("#visual-container")).toHaveScreenshot("gantt-multi-team.png");
    });

    test("creates and operates the production scroll container", async ({ page }) => {
        await page.goto(`${BASE}?scenario=manyRows`);
        await waitForRender(page);

        const scrollBody = page.locator(".gantt-scroll-body");
        const dimensions = await scrollBody.evaluate(element => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            overflowY: getComputedStyle(element).overflowY
        }));
        expect(dimensions.overflowY).toBe("auto");
        expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

        await scrollBody.evaluate(element => {
            element.scrollTop = element.scrollHeight;
        });
        await expect.poll(() => scrollBody.evaluate(element => element.scrollTop))
            .toBeGreaterThan(0);
        await expect(page.locator("#visual-container")).toHaveScreenshot("gantt-many-rows.png");
    });

    test("preserves host high-contrast and selected colors in forced-colors mode", async ({ page }) => {
        await page.emulateMedia({ forcedColors: "active" });
        await page.goto(`${BASE}?scenario=standard&highContrast=true`);
        await waitForRender(page);

        const firstDataPoint = page.locator(".gantt-data-point").first();
        await expect(firstDataPoint).toHaveAttribute("fill", "#000000");
        await expect(firstDataPoint).toHaveAttribute("stroke", "#ffffff");
        await firstDataPoint.click();
        await expect(firstDataPoint).toHaveAttribute("stroke", "#ffff00");
        await expect(page.locator("#visual-container")).toHaveScreenshot("gantt-forced-colors.png");
    });
});
