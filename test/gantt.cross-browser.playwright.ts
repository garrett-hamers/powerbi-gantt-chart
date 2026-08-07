import { expect, test } from "@playwright/test";

const BASE = "http://localhost:9322/test/visual-harness.html";

test("renders and supports core pointer and keyboard interactions", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));

    await page.goto(`${BASE}?scenario=standard`);
    await page.waitForSelector("body[data-rendered='true']", { timeout: 10000 });

    await expect(page.locator("body")).toHaveAttribute("data-renderer", "production-visual");
    await expect(page.locator(".gantt-data-point")).toHaveCount(4);

    const firstTask = page.locator(".gantt-data-point").first();
    await expect(firstTask).toHaveAttribute("aria-pressed", "false");
    await firstTask.click();
    await expect(firstTask).toHaveAttribute("aria-pressed", "true");

    await firstTask.click({ button: "right" });
    await expect(page.locator("body")).toHaveAttribute("data-context-menu-count", "1");

    await firstTask.focus();
    await firstTask.press("Shift+F10");
    await expect(page.locator("body")).toHaveAttribute("data-context-menu-count", "2");
    expect(pageErrors).toEqual([]);
});
