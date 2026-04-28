/**
 * @vitest-environment happy-dom
 *
 * Cross-highlight rendering tests.
 *
 * Power BI signals cross-highlighting from another visual by populating
 * `dataView.categorical.values[i].highlights` with a partial-opacity array
 * the same length as `values[i].values`. Null entries are NOT highlighted;
 * non-null entries ARE highlighted.
 *
 * This visual declares `supportsHighlight: true` in capabilities.json.
 *
 * GAP (see files/matrices/cross-highlight-tests-report.md): as of this
 * commit src/visual.ts does NOT inspect `values[i].highlights`. Tests
 * documenting the expected dimming behavior are therefore `it.skip`-ed
 * and are intended as a regression trap once the feature is implemented.
 */
import { describe, it, expect, beforeEach } from "vitest";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import { Visual } from "../src/visual";
import { buildMockDataView } from "./helpers/mockDataView";

let visual: Visual;
let element: HTMLElement;
let tooltipShows: any[];

function createMockHost(): any {
    return {
        createSelectionIdBuilder: () => {
            const builder: any = {
                withCategory: () => builder,
                withMeasure: () => builder,
                withSeries: () => builder,
                createSelectionId: () => ({ getKey: () => "k" })
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
            show: (options: any) => tooltipShows.push(options),
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

function makeUpdateOptions(dataView: any, width = 600, height = 400): VisualUpdateOptions {
    return {
        dataViews: dataView ? [dataView] : [],
        viewport: { width, height },
        type: 2
    } as any;
}

function withHighlights(dv: any, highlights: Array<number | null>, valueIndex = 0): any {
    const cloned = JSON.parse(JSON.stringify(dv));
    if (cloned?.categorical?.values?.[valueIndex]) {
        cloned.categorical.values[valueIndex].highlights = highlights;
    }
    return cloned;
}

function baseDataView() {
    return buildMockDataView({
        tasks: ["Design", "Build", "Test", "Ship"],
        startDates: ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"],
        endDates: ["2024-02-01", "2024-03-01", "2024-04-01", "2024-05-01"],
        progress: [100, 75, 50, 0]
    });
}

beforeEach(() => {
    element = document.createElement("div");
    document.body.appendChild(element);
    tooltipShows = [];
    visual = new Visual({ element, host: createMockHost() } as VisualConstructorOptions);
});

describe("Cross-highlight rendering (gantt chart)", () => {
    it("renders normally when no highlights array is present", () => {
        visual.update(makeUpdateOptions(baseDataView()));
        expect(element.querySelectorAll("rect").length).toBeGreaterThan(0);
    });

    it("renders without throwing when highlights array is all-null (no selection active)", () => {
        const dv = withHighlights(baseDataView(), [null, null, null, null]);
        expect(() => visual.update(makeUpdateOptions(dv))).not.toThrow();
        expect(element.querySelectorAll("rect").length).toBeGreaterThan(0);
    });

    it("renders without throwing when highlights array has partial highlights", () => {
        const dv = withHighlights(baseDataView(), [100, null, 50, null]);
        expect(() => visual.update(makeUpdateOptions(dv))).not.toThrow();
        expect(element.querySelectorAll("rect").length).toBeGreaterThan(0);
    });

    it("renders without throwing when all highlights are non-null", () => {
        const dv = withHighlights(baseDataView(), [100, 75, 50, 25]);
        expect(() => visual.update(makeUpdateOptions(dv))).not.toThrow();
        expect(element.querySelectorAll("rect").length).toBeGreaterThan(0);
    });

    it("dims non-highlighted task bars when partial highlights are present", () => {
        const dv = withHighlights(baseDataView(), [100, null, 50, null]);
        visual.update(makeUpdateOptions(dv));
        const highlighted = element.querySelector(`rect.gantt-bar[data-dp-index="0"]`) as SVGRectElement;
        const dimmed = element.querySelector(`rect.gantt-bar[data-dp-index="1"]`) as SVGRectElement;
        expect(highlighted.style.opacity).toBe("0.8");
        expect(dimmed.style.opacity).toBe("0.3");
    });

    it("uses highlight value in tooltips when present", () => {
        const dv = withHighlights(baseDataView(), [null, null, 25, null], 2);
        visual.update(makeUpdateOptions(dv));
        const highlighted = element.querySelector(`rect.gantt-bar[data-dp-index="2"]`) as SVGRectElement;
        highlighted.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, clientX: 10, clientY: 20 }));
        expect(tooltipShows.length).toBeGreaterThan(0);
        const progress = tooltipShows[0].dataItems.find((item: any) => item.displayName === "Progress");
        expect(progress?.value).toBe("25%");
    });
});
