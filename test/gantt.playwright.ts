import { expect, Page, test } from "@playwright/test";

const BASE = "http://localhost:9322/test/visual-harness.html";

interface ContrastReport {
    rootBackground: string;
    essentialMinimum: number;
    dataLabelMinimum: number;
    measuredLabelSegments: number;
}

async function waitForRender(page: Page): Promise<void> {
    await page.waitForSelector("body[data-rendered='true']", { timeout: 10000 });
    await expect(page.locator("body")).toHaveAttribute("data-renderer", "production-visual");
}

async function measureForcedColorContrast(page: Page): Promise<ContrastReport> {
    return page.evaluate(() => {
        type Rgb = [number, number, number];

        const requiredElement = (selector: string): Element => {
            const element = document.querySelector(selector);
            if (!element) {
                throw new Error(`Missing contrast-test element: ${selector}`);
            }
            return element;
        };
        const parseColor = (value: string): Rgb => {
            const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(value);
            if (!match) {
                throw new Error(`Unsupported computed color: ${value}`);
            }
            return [Number(match[1]), Number(match[2]), Number(match[3])];
        };
        const serializeColor = (color: Rgb): string =>
            `rgb(${color.map(channel => Math.round(channel)).join(", ")})`;
        const composite = (foreground: Rgb, background: Rgb, opacity: number): Rgb => [
            foreground[0] * opacity + background[0] * (1 - opacity),
            foreground[1] * opacity + background[1] * (1 - opacity),
            foreground[2] * opacity + background[2] * (1 - opacity)
        ];
        const luminance = (color: Rgb): number => {
            const channels = color.map(channel => {
                const normalized = channel / 255;
                return normalized <= 0.04045
                    ? normalized / 12.92
                    : Math.pow((normalized + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };
        const ratio = (foreground: Rgb, background: Rgb): number => {
            const foregroundLuminance = luminance(foreground);
            const backgroundLuminance = luminance(background);
            const lighter = Math.max(foregroundLuminance, backgroundLuminance);
            const darker = Math.min(foregroundLuminance, backgroundLuminance);
            return (lighter + 0.05) / (darker + 0.05);
        };
        const styleColor = (element: Element, property: "fill" | "stroke" | "backgroundColor"): Rgb =>
            parseColor(getComputedStyle(element)[property]);
        const opacity = (element: Element): number => {
            const value = Number(getComputedStyle(element).opacity);
            return Number.isFinite(value) ? value : 1;
        };
        const horizontalIntersection = (left: number, right: number, other: DOMRect): number =>
            Math.max(0, Math.min(right, other.right) - Math.max(left, other.left));

        const root = requiredElement(".gantt-root");
        const rootBackground = styleColor(root, "backgroundColor");
        const essentialRatios = [
            ".chart-title",
            ".x-axis text",
            ".y-label",
            ".legend text"
        ].map(selector => ratio(styleColor(requiredElement(selector), "fill"), rootBackground));
        const labelRatios: number[] = [];

        for (const label of document.querySelectorAll<SVGTextElement>(".data-label")) {
            const rowIndex = label.dataset.dpIndex;
            if (rowIndex === undefined) {
                throw new Error("Data label is missing its data-point index");
            }

            const labelColor = styleColor(label, "fill");
            const labelRect = label.getBoundingClientRect();
            const bar = document.querySelector<SVGGraphicsElement>(
                `.gantt-bar[data-dp-index="${rowIndex}"]`
            );
            if (!bar) {
                labelRatios.push(ratio(labelColor, rootBackground));
                continue;
            }

            const barRect = bar.getBoundingClientRect();
            const visibleLeft = Math.max(labelRect.left, barRect.left);
            const visibleRight = Math.min(labelRect.right, barRect.right);
            const visibleWidth = Math.max(0, visibleRight - visibleLeft);
            if (visibleWidth === 0) {
                continue;
            }

            const barBackground = composite(
                styleColor(bar, "fill"),
                rootBackground,
                opacity(bar)
            );
            const progress = document.querySelector<SVGRectElement>(
                `.gantt-progress[data-dp-index="${rowIndex}"]`
            );
            const progressWidth = progress
                ? horizontalIntersection(visibleLeft, visibleRight, progress.getBoundingClientRect())
                : 0;
            const baseWidth = visibleWidth - progressWidth;
            const isProgressLayer = label.classList.contains("data-label-progress");
            const isBaseLayer = label.classList.contains("data-label-base");

            if (progress && progressWidth > 0 && !isBaseLayer) {
                const progressBackground = composite(
                    styleColor(progress, "fill"),
                    barBackground,
                    opacity(progress)
                );
                labelRatios.push(ratio(labelColor, progressBackground));
            }
            if (baseWidth > 0 && !isProgressLayer) {
                labelRatios.push(ratio(labelColor, barBackground));
            }
        }

        if (labelRatios.length === 0) {
            throw new Error("No visible data-label segments were measured");
        }

        return {
            rootBackground: serializeColor(rootBackground),
            essentialMinimum: Math.min(...essentialRatios),
            dataLabelMinimum: Math.min(...labelRatios),
            measuredLabelSegments: labelRatios.length
        };
    });
}

async function measureSelectedOutlineContrast(page: Page): Promise<number> {
    return page.evaluate(() => {
        const root = document.querySelector<HTMLElement>(".gantt-root");
        const selected = document.querySelector<SVGGraphicsElement>(".gantt-data-point");
        if (!root || !selected) {
            throw new Error("Missing selected-outline contrast elements");
        }
        const parse = (value: string): number[] => {
            const match = value.match(/[\d.]+/g);
            if (!match || match.length < 3) {
                throw new Error(`Unsupported computed color: ${value}`);
            }
            return match.slice(0, 3).map(Number);
        };
        const luminance = (value: string): number => {
            const channels = parse(value).map(channel => {
                const normalized = channel / 255;
                return normalized <= 0.04045
                    ? normalized / 12.92
                    : Math.pow((normalized + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
        };
        const foreground = luminance(getComputedStyle(selected).stroke);
        const background = luminance(getComputedStyle(root).backgroundColor);
        return (Math.max(foreground, background) + 0.05)
            / (Math.min(foreground, background) + 0.05);
    });
}

test.describe("production Gantt visual", () => {
    test("renders the standard scenario with production styles", async ({ page }) => {
        await page.goto(`${BASE}?scenario=standard`);
        await waitForRender(page);

        await expect(page.locator(".gantt-root")).toHaveCount(1);
        const rootBackground = await page.locator(".gantt-root").evaluate(element => ({
            inline: (element as HTMLElement).style.backgroundColor,
            computed: getComputedStyle(element).backgroundColor,
            highContrastClass: element.classList.contains("gantt-high-contrast")
        }));
        expect(rootBackground.inline).toBe("");
        expect(rootBackground.computed).toBe("rgba(0, 0, 0, 0)");
        expect(rootBackground.highContrastClass).toBe(false);
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
        for (const scenario of ["standard", "multiTeam", "roundedPartial"]) {
            await page.goto(`${BASE}?scenario=${scenario}&highContrast=true`);
            await waitForRender(page);
            const report = await measureForcedColorContrast(page);
            console.log(
                `FORCED_COLOR_MIN_CONTRAST ${scenario} `
                + `essential=${report.essentialMinimum.toFixed(4)} `
                + `dataLabel=${report.dataLabelMinimum.toFixed(4)} `
                + `segments=${report.measuredLabelSegments}`
            );
            expect(report.rootBackground).toBe("rgb(0, 0, 0)");
            expect(report.essentialMinimum).toBeGreaterThanOrEqual(4.5);
            expect(report.dataLabelMinimum).toBeGreaterThanOrEqual(4.5);
        }

        await page.goto(`${BASE}?scenario=roundedPartial&highContrast=true`);
        await waitForRender(page);
        const roundedGeometry = await page.evaluate(() => {
            const progress = document.querySelector<SVGRectElement>(".gantt-progress");
            const progressLabel = document.querySelector<SVGTextElement>(".data-label-progress");
            const baseLabel = document.querySelector<SVGTextElement>(".data-label-base");
            if (!progress || !progressLabel || !baseLabel) {
                throw new Error("Missing rounded-progress geometry");
            }
            const clipRadius = (label: SVGTextElement): number => {
                const clipReference = label.getAttribute("clip-path") || "";
                const clipId = /url\(#([^)]+)\)/.exec(clipReference)?.[1];
                const clipRect = clipId
                    ? document.querySelector<SVGRectElement>(`#${CSS.escape(clipId)} rect`)
                    : null;
                if (!clipRect) {
                    throw new Error(`Missing clip rectangle for ${clipReference}`);
                }
                return Number(clipRect.getAttribute("rx"));
            };
            return {
                progressRadius: Number(progress.getAttribute("rx")),
                progressClipRadius: clipRadius(progressLabel),
                baseClipRadius: clipRadius(baseLabel)
            };
        });
        expect(roundedGeometry.progressRadius).toBe(16);
        expect(roundedGeometry.progressClipRadius).toBe(roundedGeometry.progressRadius);
        expect(roundedGeometry.baseClipRadius).toBe(roundedGeometry.progressRadius);

        await page.goto(`${BASE}?scenario=standard&highContrast=true`);
        await waitForRender(page);
        const firstDataPoint = page.locator(".gantt-data-point").first();
        await expect(firstDataPoint).toHaveAttribute("fill", "#000000");
        await expect(firstDataPoint).toHaveAttribute("stroke", "#ffffff");
        await firstDataPoint.click();
        await expect(firstDataPoint).toHaveAttribute("stroke", "#ffff00");
        const selectedReport = await measureForcedColorContrast(page);
        console.log(
            `FORCED_COLOR_SELECTED_MIN_CONTRAST standard `
            + `essential=${selectedReport.essentialMinimum.toFixed(4)} `
            + `dataLabel=${selectedReport.dataLabelMinimum.toFixed(4)} `
            + `segments=${selectedReport.measuredLabelSegments}`
        );
        expect(selectedReport.essentialMinimum).toBeGreaterThanOrEqual(4.5);
        expect(selectedReport.dataLabelMinimum).toBeGreaterThanOrEqual(4.5);
        const selectedContrast = await measureSelectedOutlineContrast(page);
        expect(selectedContrast).toBeGreaterThanOrEqual(3);
        await expect(page.locator("#visual-container")).toHaveScreenshot(
            "gantt-forced-colors.png",
            { maxDiffPixels: 1 }
        );

        await page.goto(`${BASE}?scenario=standard&highContrast=white`);
        await waitForRender(page);
        const whiteReport = await measureForcedColorContrast(page);
        console.log(
            `FORCED_COLOR_MIN_CONTRAST highContrastWhite `
            + `essential=${whiteReport.essentialMinimum.toFixed(4)} `
            + `dataLabel=${whiteReport.dataLabelMinimum.toFixed(4)} `
            + `segments=${whiteReport.measuredLabelSegments}`
        );
        expect(whiteReport.rootBackground).toBe("rgb(255, 255, 255)");
        expect(whiteReport.essentialMinimum).toBeGreaterThanOrEqual(4.5);
        expect(whiteReport.dataLabelMinimum).toBeGreaterThanOrEqual(4.5);

        const whiteDataPoint = page.locator(".gantt-data-point").first();
        await expect(whiteDataPoint).toHaveAttribute("fill", "#ffffff");
        await expect(whiteDataPoint).toHaveAttribute("stroke", "#000000");
        await whiteDataPoint.click();
        await expect(whiteDataPoint).toHaveAttribute("stroke", "#0000ff");
        const selectedWhiteReport = await measureForcedColorContrast(page);
        console.log(
            `FORCED_COLOR_SELECTED_MIN_CONTRAST highContrastWhite `
            + `essential=${selectedWhiteReport.essentialMinimum.toFixed(4)} `
            + `dataLabel=${selectedWhiteReport.dataLabelMinimum.toFixed(4)} `
            + `segments=${selectedWhiteReport.measuredLabelSegments}`
        );
        expect(selectedWhiteReport.essentialMinimum).toBeGreaterThanOrEqual(4.5);
        expect(selectedWhiteReport.dataLabelMinimum).toBeGreaterThanOrEqual(4.5);
        expect(await measureSelectedOutlineContrast(page)).toBeGreaterThanOrEqual(3);
    });
});
