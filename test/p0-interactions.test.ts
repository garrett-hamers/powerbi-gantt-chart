/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import { Visual } from "../src/visual";
import { buildMockDataView } from "./helpers/mockDataView";
import { createMockHost, MockHost } from "../e2e/mocks/host";

function baseDataView() {
    return buildMockDataView({
        tasks: ["Design", "Build", "Test"],
        startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
        endDates: ["2024-01-15", "2024-02-20", "2024-03-15"],
        progress: [100, 50, 10],
        categories: ["Planning", "Delivery", "QA"]
    });
}

function makeUpdateOptions(dataView: any, width = 800, height = 500): VisualUpdateOptions {
    return { dataViews: dataView ? [dataView] : [], viewport: { width, height }, type: 2 } as any;
}

function mount(dataView = baseDataView(), host: MockHost = createMockHost()) {
    const element = document.createElement("div");
    element.style.width = "800px";
    element.style.height = "500px";
    document.body.appendChild(element);
    const visual = new Visual({ element, host } as VisualConstructorOptions);
    visual.update(makeUpdateOptions(dataView));
    return { element, host, visual };
}

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe("P0 interactions and accessibility", () => {
    it("makes task bars tabbable buttons with descriptive ARIA state", () => {
        const { element } = mount();
        const bar = element.querySelector(`rect.gantt-bar[data-dp-index="0"]`) as SVGRectElement;
        expect(bar.getAttribute("tabindex")).toBe("0");
        expect(bar.getAttribute("role")).toBe("button");
        expect(bar.getAttribute("aria-pressed")).toBe("false");
        const label = bar.getAttribute("aria-label") || "";
        expect(label).toContain("Design");
        expect(label).toContain("Start");
        expect(label).toContain("End");
        expect(label).toContain("Progress");
        expect(label).toContain("Planning");
    });

    it("Enter/Space select task bars and preserve multi-select modifier", async () => {
        const { element, host } = mount();
        const first = element.querySelector(`rect.gantt-bar[data-dp-index="0"]`) as SVGRectElement;
        const second = element.querySelector(`rect.gantt-bar[data-dp-index="1"]`) as SVGRectElement;

        first.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        second.dispatchEvent(new KeyboardEvent("keydown", { key: " ", ctrlKey: true, bubbles: true, cancelable: true }));
        await flushPromises();

        expect(host.spies.select.callCount()).toBe(2);
        expect(host.spies.select.calls[0].args.multiSelect).toBe(false);
        expect(host.spies.select.calls[1].args.multiSelect).toBe(true);
        expect(second.getAttribute("aria-pressed")).toBe("true");
    });

    it("Escape clears selection and removes any visual filter", async () => {
        const { element, host } = mount();
        const first = element.querySelector(`rect.gantt-bar[data-dp-index="0"]`) as SVGRectElement;

        first.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        await flushPromises();
        first.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        await flushPromises();

        expect(host.spies.clear.callCount()).toBe(1);
        expect(host.spies.applyJsonFilter.lastCall()?.args.filter).toBeNull();
    });

    it("right-click task uses task identity while background uses an empty identity", () => {
        const { element, host } = mount();
        const bar = element.querySelector(`rect.gantt-bar[data-dp-index="0"]`) as SVGRectElement;
        const svg = element.querySelector("svg.ganttChart:not(.ganttHeader)") as SVGSVGElement;

        bar.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 30, clientY: 40 }));
        expect(host.spies.showContextMenu.callCount()).toBe(1);
        expect(host.spies.showContextMenu.lastCall()?.args.selectionId.hasIdentity()).toBe(true);

        svg.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
        expect(host.spies.showContextMenu.callCount()).toBe(2);
        expect(host.spies.showContextMenu.lastCall()?.args.selectionId).toEqual({});
    });

    it("Shift+F10 opens the Power BI context menu for the focused task", () => {
        const { element, host } = mount();
        const bar = element.querySelector(`rect.gantt-bar[data-dp-index="1"]`) as SVGRectElement;

        bar.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }));

        expect(host.spies.showContextMenu.callCount()).toBe(1);
        expect(host.spies.showContextMenu.lastCall()?.args.selectionId.hasIdentity()).toBe(true);
    });

    it("filter mode applies a BasicFilter for clicked task values and clears it on background click", async () => {
        const { element, host, visual } = mount();
        (visual as any).formattingSettings.interactionCard.crossFilterMode.value.value = "filter";
        const bar = element.querySelector(`rect.gantt-bar[data-dp-index="1"]`) as SVGRectElement;
        const svg = element.querySelector("svg.ganttChart:not(.ganttHeader)") as SVGSVGElement;

        bar.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await flushPromises();

        const filterCall = host.spies.applyJsonFilter.lastCall()?.args;
        expect(filterCall.objectName).toBe("general");
        expect(filterCall.propertyName).toBe("filter");
        expect(filterCall.filter.operator).toBe("In");
        expect(filterCall.filter.target).toEqual({ table: "Table", column: "Task" });
        expect(filterCall.filter.values).toEqual(["Build"]);

        svg.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        await flushPromises();
        expect(host.spies.applyJsonFilter.lastCall()?.args.filter).toBeNull();
    });

    it("uses host high-contrast palette for bars and grid", () => {
        const host = createMockHost({
            isHighContrast: true,
            palette: {
                foreground: "#FFFF00",
                background: "#000000",
                foregroundSelected: "#00FFFF",
                hyperlink: "#FF00FF"
            }
        });
        const { element } = mount(baseDataView(), host);
        const bar = element.querySelector(`rect.gantt-bar[data-dp-index="0"]`) as SVGRectElement;
        const grid = element.querySelector("line.grid-line") as SVGLineElement;
        expect(bar.getAttribute("fill")).toBe("#00FFFF");
        expect(grid.getAttribute("stroke")).toBe("#FFFF00");
    });

    it("warns when invalid dates cause rows to be skipped", () => {
        const host = createMockHost();
        const warnings: Array<{ hoverText: string; detailedText: string }> = [];
        (host as any).displayWarningIcon = (hoverText: string, detailedText: string) => warnings.push({ hoverText, detailedText });
        const dataView = buildMockDataView({
            tasks: ["Good", "Bad"],
            startDates: ["2024-01-01", "not-a-date"],
            endDates: ["2024-01-10", "2024-02-01"]
        });

        mount(dataView, host);

        expect(warnings).toHaveLength(1);
        expect(warnings[0].detailedText).toContain("1 row");
    });
});
