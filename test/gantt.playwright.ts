import { test, expect } from "@playwright/test";

const BASE = "http://localhost:9222/test/visual-harness.html";

async function waitForRender(page: any) {
    await page.waitForSelector("[data-rendered='true']", { timeout: 10000 });
    // Brief pause for SVG paint
    await page.waitForTimeout(300);
}

test.describe("Gantt chart visual screenshots", () => {
    test("standard scenario", async ({ page }) => {
        await page.goto(`${BASE}?scenario=standard`);
        await waitForRender(page);
        await expect(page.locator("#visual-container")).toHaveScreenshot("gantt-standard.png");
    });

    test("multi-team scenario", async ({ page }) => {
        await page.goto(`${BASE}?scenario=multiTeam`);
        await waitForRender(page);
        await expect(page.locator("#visual-container")).toHaveScreenshot("gantt-multi-team.png");
    });

    test("many rows scenario (scrolling)", async ({ page }) => {
        await page.goto(`${BASE}?scenario=manyRows`);
        await waitForRender(page);
        await expect(page.locator("#visual-container")).toHaveScreenshot("gantt-many-rows.png");
    });
});
