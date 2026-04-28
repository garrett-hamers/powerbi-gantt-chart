/**
 * Tooltip-behavior tests — Gantt Chart.
 *
 * Mounts the real Visual class via window.__mountWithHost (added to the
 * harness entry) so tooltipService.show / move / hide are routed through the
 * mockHost spies. Asserts payload shape and event sequencing.
 */
import { test, expect } from "@playwright/test";
import * as path from "path";

const previewUrl = "file:///" + path.resolve(__dirname, "visual-harness.html").replace(/\\/g, "/");
const HOVER_SELECTOR = "rect.gantt-bar[data-dp-index]";

interface Row { task: string; category: string; start: string; end: string; progress?: number | null; }

const BASELINE: Row[] = [
    { task: "Design",      category: "Phase 1", start: "2025-01-01", end: "2025-01-15", progress: 1.0 },
    { task: "Develop",     category: "Phase 2", start: "2025-01-10", end: "2025-02-20", progress: 0.6 },
    { task: "Test",        category: "Phase 3", start: "2025-02-15", end: "2025-03-10", progress: 0.2 }
];
const NULLY: Row[] = [
    { task: "Has Progress", category: "P", start: "2025-01-01", end: "2025-01-10", progress: 0.5 },
    { task: "No Progress",  category: "P", start: "2025-01-12", end: "2025-01-20", progress: null }
];

function buildDV(rows: Row[]) {
    return {
        categorical: {
            categories: [
                { source: { displayName: "Task",     queryName: "T.Task",     type: { text: true }, roles: { task: true } },     values: rows.map(r => r.task) },
                { source: { displayName: "Category", queryName: "T.Category", type: { text: true }, roles: { category: true } }, values: rows.map(r => r.category) }
            ],
            values: [
                { source: { displayName: "Start Date", queryName: "T.Start", roles: { startDate: true } }, values: rows.map(r => r.start) },
                { source: { displayName: "End Date",   queryName: "T.End",   roles: { endDate: true } },   values: rows.map(r => r.end) },
                { source: { displayName: "Progress",   queryName: "T.Prog",  roles: { progress: true } },  values: rows.map(r => r.progress ?? null) }
            ]
        },
        metadata: { columns: [] }
    };
}

async function mount(page: any, id: string, rows: Row[]) {
    await page.evaluate(({ id, dv }: any) => (window as any).__mountWithHost(id, dv, { width: 900, height: 360 }), { id, dv: buildDV(rows) });
    await page.waitForSelector(`#${id} ${HOVER_SELECTOR}`);
}
async function dispatch(page: any, sel: string, type: string) {
    await page.evaluate(({ sel, type }: any) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (!el) throw new Error("not found: " + sel);
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 200, clientY: 100, view: window }));
    }, { sel, type });
}
async function spies(page: any, id: string) {
    return page.evaluate((cid: string) => {
        const h = (window as any).__mockHosts[cid];
        return {
            show: h.spies.tooltipShow.callCount(),
            move: h.spies.tooltipMove.callCount(),
            hide: h.spies.tooltipHide.callCount(),
            lastShow: h.spies.tooltipShow.lastCall(),
        };
    }, id);
}

test.describe("Gantt Chart — tooltip behavior via mock tooltipService", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(previewUrl, { waitUntil: "networkidle" });
        await page.waitForFunction(() => (window as any).__mountWithHost && (window as any).__visualsReady);
    });

    test("hover bar → tooltipShow with Task/Start/End dataItems", async ({ page }) => {
        await mount(page, "tt-baseline", BASELINE);
        await dispatch(page, `#tt-baseline ${HOVER_SELECTOR}`, "mouseover");
        const s = await spies(page, "tt-baseline");
        expect(s.show).toBeGreaterThanOrEqual(1);
        const items = s.lastShow.args.dataItems as Array<{ displayName: string; value: string }>;
        const names = items.map(i => i.displayName);
        expect(names).toContain("Task");
        expect(names).toContain("Start");
        expect(names).toContain("End");
    });

    test("mousemove → move (or follow-up show) fires", async ({ page }) => {
        await mount(page, "tt-move", BASELINE);
        await dispatch(page, `#tt-move ${HOVER_SELECTOR}`, "mouseover");
        await dispatch(page, `#tt-move ${HOVER_SELECTOR}`, "mousemove");
        const s = await spies(page, "tt-move");
        expect(s.show + s.move).toBeGreaterThanOrEqual(2);
    });

    test("mouseout → tooltipHide fires", async ({ page }) => {
        await mount(page, "tt-leave", BASELINE);
        await dispatch(page, `#tt-leave ${HOVER_SELECTOR}`, "mouseover");
        await dispatch(page, `#tt-leave ${HOVER_SELECTOR}`, "mouseout");
        const s = await spies(page, "tt-leave");
        expect(s.hide).toBeGreaterThanOrEqual(1);
    });

    test("payload reflects fixture's first row", async ({ page }) => {
        await mount(page, "tt-payload", BASELINE);
        await dispatch(page, `#tt-payload ${HOVER_SELECTOR}[data-dp-index="0"]`, "mouseover");
        const s = await spies(page, "tt-payload");
        const items = s.lastShow.args.dataItems as Array<{ displayName: string; value: string }>;
        const task = items.find(i => i.displayName === "Task");
        expect(task?.value).toBe("Design");
    });

    test("null progress: hovering does not crash", async ({ page }) => {
        await mount(page, "tt-null", NULLY);
        await dispatch(page, `#tt-null ${HOVER_SELECTOR}`, "mouseover");
        const s = await spies(page, "tt-null");
        expect(s.show).toBeGreaterThanOrEqual(1);
        const items = s.lastShow.args.dataItems as Array<{ displayName: string; value: any }>;
        for (const it of items) expect(it.value === null || it.value === undefined).toBe(false);
    });
});
