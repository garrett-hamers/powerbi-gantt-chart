/**
 * Context-menu conformance test for Gantt Chart.
 *
 * Verifies that a right-click on the rendered visual invokes
 * selectionManager.showContextMenu — the contract Power BI requires
 * so the host can display its native data-point / plot-area menu.
 *
 * Mounts the production Visual class through the preview harness and asserts
 * the native Power BI context-menu payloads for data points and plot area.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";

const previewUrl = "file:///" + path.resolve(__dirname, "visual-harness.html").replace(/\\/g, "/");
const HOST_ID = "ctx-real";
const CHART_ROOT = `#${HOST_ID} svg.ganttChart:not(.ganttHeader)`;
const DATA_ELEMENT = `#${HOST_ID} rect.gantt-bar`;

async function mountRealVisual(page: import("@playwright/test").Page) {
    await page.evaluate((id: string) => {
        (window as any).__mountWithHost(id, (window as any).__defaultDataView, { width: 900, height: 360 });
    }, HOST_ID);
}

async function lastContextCall(page: import("@playwright/test").Page) {
    return page.evaluate((id: string) => {
        const host = (window as any).__mockHosts[id];
        const args = host.spies.showContextMenu.lastCall()?.args;
        const selectionId = args?.selectionId;
        return {
            position: args?.position,
            isEmptyIdentity: selectionId && Object.keys(selectionId).length === 0,
            hasIdentity: typeof selectionId?.hasIdentity === "function" ? selectionId.hasIdentity() : false
        };
    }, HOST_ID);
}

async function contextCallCount(page: import("@playwright/test").Page): Promise<number> {
    return page.evaluate((id: string) => {
        const host = (window as any).__mockHosts[id];
        return host.spies.showContextMenu.callCount();
    }, HOST_ID);
}

test.describe("Gantt Chart — context menu conformance", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(previewUrl, { waitUntil: "networkidle" });
        await page.waitForFunction(() => (window as any).__mountWithHost && (window as any).__defaultDataView);
        await mountRealVisual(page);
    });

    test("right-click on data element invokes showContextMenu with task identity", async ({ page }) => {
        const bar = page.locator(DATA_ELEMENT).first();
        await expect(bar).toBeVisible();
        await bar.click({ button: "right", force: true });

        const viewport = page.viewportSize()!;
        const result = await lastContextCall(page);
        const callCount = await contextCallCount(page);

        expect(callCount).toBe(1);
        expect(result).toBeTruthy();
        expect(result.position.x).toBeGreaterThan(0);
        expect(result.position.y).toBeGreaterThan(0);
        expect(result.position.x).toBeLessThan(viewport.width);
        expect(result.position.y).toBeLessThan(viewport.height);
        expect(result.hasIdentity).toBe(true);
        expect(result.isEmptyIdentity).toBe(false);
    });

    test("right-click on plot background invokes showContextMenu (plot-area menu signal)", async ({ page }) => {
        const svg = page.locator(CHART_ROOT);
        const box = await svg.boundingBox();
        expect(box).not.toBeNull();
        // Click near the top-left corner of the SVG, away from bars.
        await page.mouse.move(box!.x + 2, box!.y + 2);
        await page.mouse.click(box!.x + 2, box!.y + 2, { button: "right" });

        const callCount = await contextCallCount(page);
        const last = await lastContextCall(page);
        expect(callCount).toBe(1);
        expect(last.isEmptyIdentity).toBe(true);
    });

    test("Shift+F10 keyboard shortcut opens context menu for focused task", async ({ page }) => {
        const bar = page.locator(DATA_ELEMENT).first();
        await bar.focus();
        await page.keyboard.press("Shift+F10");

        const callCount = await contextCallCount(page);
        const last = await lastContextCall(page);
        expect(callCount).toBe(1);
        expect(last.hasIdentity).toBe(true);
        expect(last.isEmptyIdentity).toBe(false);
    });

    test("contextmenu handler calls event.preventDefault (suppresses browser menu)", async ({ page }) => {
        const prevented = await page.locator(DATA_ELEMENT).first().evaluate((el) => {
            const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
            el.dispatchEvent(event);
            return event.defaultPrevented;
        });
        expect(prevented).toBe(true);
    });
});
