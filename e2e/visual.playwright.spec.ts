import { test, expect } from "@playwright/test";
import * as path from "path";

const previewUrl = "file:///" + path.resolve(__dirname, "visual-harness.html").replace(/\\/g, "/");

test.describe("Gantt Chart — Preview", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(previewUrl, { waitUntil: "networkidle" });
        await page.waitForSelector("[data-rendered='true']", { timeout: 10000 });
    });

    test("captures full-page screenshot", async ({ page }) => {
        await page.screenshot({
            path: path.resolve(__dirname, "screenshots", "gantt-chart-preview.png"),
            fullPage: true
        });
    });

    test("renders 3 gantt charts", async ({ page }) => {
        await expect(page.locator("svg.ganttChart")).toHaveCount(3);
        await expect(page.locator("#standard svg.ganttChart")).toHaveCount(1);
        await expect(page.locator("#multiTeam svg.ganttChart")).toHaveCount(1);
        await expect(page.locator("#manyRows svg.ganttChart")).toHaveCount(1);
    });

    test("each chart has the expected number of task bars", async ({ page }) => {
        await expect(page.locator("#standard svg.ganttChart rect.gantt-bar")).toHaveCount(8);
        await expect(page.locator("#multiTeam svg.ganttChart rect.gantt-bar")).toHaveCount(15);
        await expect(page.locator("#manyRows svg.ganttChart rect.gantt-bar")).toHaveCount(30);
    });

    test("today-line is rendered in every chart when showTodayLine is true", async ({ page }) => {
        await expect(page.locator("#standard svg.ganttChart line.today-line")).toHaveCount(1);
        await expect(page.locator("#multiTeam svg.ganttChart line.today-line")).toHaveCount(1);
        await expect(page.locator("#manyRows svg.ganttChart line.today-line")).toHaveCount(1);
    });
});
