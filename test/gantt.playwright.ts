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

        const contrast = await page.evaluate(() => {
            const requiredElement = (selector: string): Element => {
                const element = document.querySelector(selector);
                if (!element) {
                    throw new Error(`Missing contrast-test element: ${selector}`);
                }
                return element;
            };
            const parseColor = (value: string): [number, number, number] => {
                const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(value);
                if (!match) {
                    throw new Error(`Unsupported computed color: ${value}`);
                }
                return [Number(match[1]), Number(match[2]), Number(match[3])];
            };
            const luminance = (color: string): number => {
                const channels = parseColor(color).map(channel => {
                    const normalized = channel / 255;
                    return normalized <= 0.04045
                        ? normalized / 12.92
                        : Math.pow((normalized + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
            };
            const ratio = (foreground: string, background: string): number => {
                const foregroundLuminance = luminance(foreground);
                const backgroundLuminance = luminance(background);
                const lighter = Math.max(foregroundLuminance, backgroundLuminance);
                const darker = Math.min(foregroundLuminance, backgroundLuminance);
                return (lighter + 0.05) / (darker + 0.05);
            };
            const computed = (selector: string, property: "fill" | "stroke" | "backgroundColor"): string => {
                const style = getComputedStyle(requiredElement(selector));
                return style[property];
            };

            const rootBackground = computed(".gantt-root", "backgroundColor");
            const progressFill = computed(".gantt-progress", "fill");
            return {
                rootBackground,
                title: ratio(computed(".chart-title", "fill"), rootBackground),
                axis: ratio(computed(".x-axis text", "fill"), rootBackground),
                task: ratio(computed(".y-label", "fill"), rootBackground),
                legend: ratio(computed(".legend text", "fill"), rootBackground),
                dataLabel: ratio(computed(".data-label", "fill"), progressFill),
                selectedOutline: ratio(
                    computed(".gantt-data-point", "stroke"),
                    rootBackground
                )
            };
        });
        expect(contrast.rootBackground).toBe("rgb(0, 0, 0)");
        expect(contrast.title).toBeGreaterThanOrEqual(4.5);
        expect(contrast.axis).toBeGreaterThanOrEqual(4.5);
        expect(contrast.task).toBeGreaterThanOrEqual(4.5);
        expect(contrast.legend).toBeGreaterThanOrEqual(4.5);
        expect(contrast.dataLabel).toBeGreaterThanOrEqual(4.5);
        expect(contrast.selectedOutline).toBeGreaterThanOrEqual(3);
        await expect(page.locator("#visual-container")).toHaveScreenshot("gantt-forced-colors.png");
    });
});
