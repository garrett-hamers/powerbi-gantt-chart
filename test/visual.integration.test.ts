/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from "vitest";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import { Visual } from "../src/visual";
import { buildMockDataView } from "./helpers/mockDataView";

let visual: Visual;
let element: HTMLElement;

function createMockHost(): any {
    const selectionIds: any[] = [];
    return {
        createSelectionIdBuilder: () => {
            const builder: any = {
                withCategory: () => builder,
                withMeasure: () => builder,
                withSeries: () => builder,
                createSelectionId: () => ({ getKey: () => "mock-key-" + selectionIds.length })
            };
            return builder;
        },
        createSelectionManager: () => ({
            select: () => Promise.resolve([]),
            clear: () => Promise.resolve([]),
            registerOnSelectCallback: () => {},
            showContextMenu: () => {}
        }),
        tooltipService: {
            show: () => {},
            move: () => {},
            hide: () => {},
            enabled: () => true
        },
        colorPalette: {},
        eventService: {
            renderingStarted: () => {},
            renderingFinished: () => {},
            renderingFailed: () => {}
        }
    };
}

beforeEach(() => {
    element = document.createElement("div");
    document.body.appendChild(element);
    const host = createMockHost();
    visual = new Visual({ element, host } as VisualConstructorOptions);
});

function makeUpdateOptions(dataView: any, width = 600, height = 400): VisualUpdateOptions {
    return {
        dataViews: dataView ? [dataView] : [],
        viewport: { width, height },
        type: 2
    } as any;
}

describe("Gantt Visual integration", () => {
    it("constructor creates SVG with class ganttChart", () => {
        expect(element.querySelector("svg.ganttChart")).not.toBeNull();
    });

    it("constructor creates g.chartContainer", () => {
        expect(element.querySelector("g.chartContainer")).not.toBeNull();
    });

    it("update with valid data produces rect elements", () => {
        const dv = buildMockDataView({
            tasks: ["Design", "Develop", "Test"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
            endDates: ["2024-01-31", "2024-03-15", "2024-04-01"],
            progress: [100, 50, 0]
        });
        visual.update(makeUpdateOptions(dv));
        expect(element.querySelectorAll("rect").length).toBeGreaterThan(0);
    });

    it("update with null dataViews renders landing page text", () => {
        visual.update(makeUpdateOptions(null));
        const texts = element.querySelectorAll("text");
        const hasLanding = Array.from(texts).some(t => t.textContent?.includes("Atlyn Gantt Chart"));
        expect(hasLanding).toBe(true);
    });

    it("second update replaces content (no element duplication)", () => {
        const dv = buildMockDataView({
            tasks: ["Design", "Develop", "Test"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
            endDates: ["2024-01-31", "2024-03-15", "2024-04-01"],
            progress: [100, 50, 0]
        });
        visual.update(makeUpdateOptions(dv));
        const countBefore = element.querySelectorAll("rect").length;
        visual.update(makeUpdateOptions(dv));
        const countAfter = element.querySelectorAll("rect").length;
        expect(countAfter).toBe(countBefore);
    });

    it("small viewport (50×50) does not throw", () => {
        const dv = buildMockDataView({
            tasks: ["Design", "Develop", "Test"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
            endDates: ["2024-01-31", "2024-03-15", "2024-04-01"],
            progress: [100, 50, 0]
        });
        expect(() => visual.update(makeUpdateOptions(dv, 50, 50))).not.toThrow();
    });

    it("getFormattingModel() returns valid object", () => {
        const dv = buildMockDataView({
            tasks: ["Design", "Develop", "Test"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
            endDates: ["2024-01-31", "2024-03-15", "2024-04-01"],
            progress: [100, 50, 0]
        });
        visual.update(makeUpdateOptions(dv));
        const model = visual.getFormattingModel();
        expect(model).toBeDefined();
        expect(typeof model).toBe("object");
    });

    it("SVG dimensions match viewport", () => {
        const dv = buildMockDataView({
            tasks: ["Design", "Develop", "Test"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
            endDates: ["2024-01-31", "2024-03-15", "2024-04-01"],
            progress: [100, 50, 0]
        });
        visual.update(makeUpdateOptions(dv, 800, 500));
        const svg = element.querySelector("svg.ganttChart");
        expect(svg?.getAttribute("width")).toBe("800");
        expect(svg?.getAttribute("height")).toBe("500");
    });

    it("overlapping date ranges don't crash", () => {
        const dv = buildMockDataView({
            tasks: ["A", "B"],
            startDates: ["2024-01-01", "2024-01-01"],
            endDates: ["2024-06-01", "2024-06-01"],
            progress: [50, 50]
        });
        expect(() => visual.update(makeUpdateOptions(dv))).not.toThrow();
    });

    it("context menu doesn't throw", () => {
        const svg = element.querySelector("svg.ganttChart");
        expect(() => {
            const event = new MouseEvent("contextmenu", { bubbles: true, clientX: 100, clientY: 100 });
            svg?.dispatchEvent(event);
        }).not.toThrow();
    });
});
