/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type powerbi from "powerbi-visuals-api";
import { Visual } from "../src/visual";
import { buildMockDataView } from "./helpers/mockDataView";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import HostSelectionId = powerbi.extensibility.ISelectionId;
import SelectionId = powerbi.visuals.ISelectionId;

interface HostHarness {
    host: IVisualHost;
    renderEvents: string[];
    select: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    showContextMenu: ReturnType<typeof vi.fn>;
    applyJsonFilter: ReturnType<typeof vi.fn>;
    tooltipShow: ReturnType<typeof vi.fn>;
    tooltipMove: ReturnType<typeof vi.fn>;
    tooltipHide: ReturnType<typeof vi.fn>;
    invokeSelectionCallback(selectionIds: HostSelectionId[]): void;
}

function createSelectionId(rowIndex: number): SelectionId {
    const key = `selection-${rowIndex}`;
    return {
        equals: other => other.getKey() === key,
        includes: other => other.getKey() === key,
        getKey: () => key,
        getSelector: () => ({}) as powerbi.data.Selector,
        getSelectorsByColumn: () => ({}) as powerbi.data.SelectorsByColumn,
        hasIdentity: () => true
    };
}

function createMockHost(options: {
    instanceId?: string;
    highContrast?: boolean;
    getColorError?: Error;
    allowInteractions?: boolean;
    foreground?: string;
    background?: string;
    foregroundSelected?: string;
} = {}): HostHarness {
    const selected: SelectionId[] = [];
    let selectionCallback: (selectionIds: HostSelectionId[]) => void = () => undefined;
    const select = vi.fn((selectionId: HostSelectionId | HostSelectionId[], multiSelect = false) => {
        const incoming = (Array.isArray(selectionId) ? selectionId : [selectionId])
            .filter(isSelectionId);
        if (!multiSelect) {
            selected.splice(0, selected.length, ...incoming);
        } else {
            for (const id of incoming) {
                const existingIndex = selected.findIndex(existing => existing.getKey() === id.getKey());
                if (existingIndex >= 0) {
                    selected.splice(existingIndex, 1);
                } else {
                    selected.push(id);
                }
            }
        }
        selectionCallback(selected);
        return Promise.resolve([...selected] as HostSelectionId[]);
    });
    const clear = vi.fn(() => {
        selected.splice(0, selected.length);
        selectionCallback([]);
        return Promise.resolve({});
    });
    const showContextMenu = vi.fn(() => Promise.resolve({}));
    const applyJsonFilter = vi.fn();
    const tooltipShow = vi.fn();
    const tooltipMove = vi.fn();
    const tooltipHide = vi.fn();
    const renderEvents: string[] = [];
    const color = (value: string): powerbi.IColorInfo => ({ value });
    const palette = {
        isHighContrast: options.highContrast ?? false,
        foreground: color(options.foreground || (options.highContrast ? "#ffffff" : "#333333")),
        foregroundNeutralLight: color("#e0e0e0"),
        foregroundNeutralSecondary: color("#666666"),
        foregroundSelected: color(options.foregroundSelected || "#ffff00"),
        background: color(options.background || (options.highContrast ? "#000000" : "#ffffff")),
        getColor: vi.fn((key: string) => {
            if (options.getColorError) {
                throw options.getColorError;
            }
            return color(key === "Phase 2" ? "#FF9800" : "#2196F3");
        }),
        reset: vi.fn()
    } as unknown as powerbi.extensibility.ISandboxExtendedColorPalette;

    const selectionManager = {
        select,
        clear,
        showContextMenu,
        getSelectionIds: () => [...selected] as HostSelectionId[],
        hasSelection: () => selected.length > 0,
        registerOnSelectCallback: (callback: (selectionIds: HostSelectionId[]) => void) => {
            selectionCallback = callback;
        },
        toggleExpandCollapse: () => Promise.resolve({})
    } as powerbi.extensibility.ISelectionManager;

    const host = {
        instanceId: options.instanceId || "host-instance",
        locale: "en-US",
        hostCapabilities: {
            allowInteractions: options.allowInteractions ?? true
        },
        colorPalette: palette,
        createSelectionManager: () => selectionManager,
        createSelectionIdBuilder: () => {
            let rowIndex = -1;
            const builder = {
                withCategory: (_column: powerbi.DataViewCategoryColumn, index: number) => {
                    rowIndex = index;
                    return builder;
                },
                createSelectionId: () => createSelectionId(rowIndex)
            };
            return builder as unknown as powerbi.visuals.ISelectionIdBuilder;
        },
        tooltipService: {
            enabled: () => true,
            show: tooltipShow,
            move: tooltipMove,
            hide: tooltipHide
        },
        eventService: {
            renderingStarted: () => renderEvents.push("started"),
            renderingFinished: () => renderEvents.push("finished"),
            renderingFailed: () => renderEvents.push("failed")
        },
        applyJsonFilter
    } as unknown as IVisualHost;

    return {
        host,
        renderEvents,
        select,
        clear,
        showContextMenu,
        applyJsonFilter,
        tooltipShow,
        tooltipMove,
        tooltipHide,
        invokeSelectionCallback: selectionIds => selectionCallback(selectionIds)
    };
}

function makeUpdateOptions(
    dataView: powerbi.DataView | null,
    width = 600,
    height = 400
): VisualUpdateOptions {
    return {
        dataViews: dataView ? [dataView] : [],
        viewport: { width, height },
        type: 2
    } as VisualUpdateOptions;
}

function sampleDataView(overrides: Partial<Parameters<typeof buildMockDataView>[0]> = {}): powerbi.DataView {
    return buildMockDataView({
        tasks: ["Design", "Develop", "Test"],
        startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
        endDates: ["2024-01-31", "2024-03-15", "2024-04-01"],
        progress: [100, 50, 0],
        categories: ["Phase 1", "Phase 1", "Phase 2"],
        ...overrides
    });
}

describe("Gantt Visual integration", () => {
    let element: HTMLElement;
    let harness: HostHarness;
    let visual: Visual;

    beforeEach(() => {
        document.body.replaceChildren();
        element = document.createElement("div");
        document.body.appendChild(element);
        harness = createMockHost();
        visual = new Visual({ element, host: harness.host } as VisualConstructorOptions);
    });

    it("creates an accessible, instance-local chart surface", () => {
        expect(element.getAttribute("role")).toBe("region");
        expect(element.querySelectorAll("svg.ganttChart")).toHaveLength(2);
        expect(element.querySelector("g.chartContainer")).not.toBeNull();
    });

    it("returns a formatting model before the first data update", () => {
        expect(() => visual.getFormattingModel()).not.toThrow();
        expect(visual.getFormattingModel().cards.length).toBeGreaterThan(0);
    });

    it("emits exactly one successful rendering lifecycle per update", () => {
        visual.update(makeUpdateOptions(sampleDataView()));
        expect(harness.renderEvents).toEqual(["started", "finished"]);

        harness.renderEvents.splice(0);
        visual.update(makeUpdateOptions(null));
        expect(harness.renderEvents).toEqual(["started", "finished"]);
    });

    it("emits renderingFailed and rethrows a render exception", () => {
        const failingHarness = createMockHost({ getColorError: new Error("palette failure") });
        const failingVisual = new Visual({
            element: document.createElement("div"),
            host: failingHarness.host
        } as VisualConstructorOptions);

        expect(() => failingVisual.update(makeUpdateOptions(sampleDataView())))
            .toThrow("palette failure");
        expect(failingHarness.renderEvents).toEqual(["started", "failed"]);
    });

    it("renders valid data and replaces content on subsequent updates", () => {
        const dataView = sampleDataView();
        visual.update(makeUpdateOptions(dataView));
        const initialDataPoints = element.querySelectorAll(".gantt-data-point").length;

        visual.update(makeUpdateOptions(dataView));
        expect(initialDataPoints).toBe(3);
        expect(element.querySelectorAll(".gantt-data-point")).toHaveLength(initialDataPoints);
    });

    it("renders a safe landing state for empty and partial data", () => {
        visual.update(makeUpdateOptions(null, 320, 120));
        expect(element.textContent).toContain("Add Task, Start Date, and End Date fields");
        expect(element.querySelector("svg.ganttBody")?.getAttribute("height")).toBe("120");

        const partial = sampleDataView();
        partial.categorical!.values = [] as unknown as powerbi.DataViewValueColumns;
        expect(() => visual.update(makeUpdateOptions(partial))).not.toThrow();
        expect(element.textContent).toContain("Add Task, Start Date, and End Date fields");

        visual.update(makeUpdateOptions(sampleDataView()));
        expect(element.querySelector("svg.ganttBody")?.getAttribute("role")).toBe("group");
    });

    it("resizes and toggles vertical scrolling without duplicating content", () => {
        const tasks = Array.from({ length: 50 }, (_, index) => `Task ${index}`);
        visual.update(makeUpdateOptions(sampleDataView({
            tasks,
            startDates: tasks.map(() => "2024-01-01"),
            endDates: tasks.map(() => "2024-02-01"),
            progress: tasks.map(() => 50),
            categories: tasks.map(() => "Phase")
        }), 300, 120));

        const body = element.querySelector<HTMLElement>(".gantt-scroll-body");
        const bodySvg = element.querySelector<SVGSVGElement>("svg.ganttBody");
        expect(body?.style.overflowY).toBe("auto");
        expect(Number(bodySvg?.getAttribute("height"))).toBeGreaterThan(1_000);

        visual.update(makeUpdateOptions(sampleDataView(), 800, 500));
        expect(bodySvg?.getAttribute("width")).toBe("800");
        expect(body?.style.overflowY).toBe("hidden");
    });

    it("selects with pointer and keyboard while preserving multi-select", async () => {
        visual.update(makeUpdateOptions(sampleDataView()));
        const dataPoints = element.querySelectorAll<SVGGraphicsElement>(".gantt-data-point");

        dataPoints[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        dataPoints[1]?.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter",
            ctrlKey: true,
            bubbles: true
        }));
        await Promise.resolve();

        expect(harness.select).toHaveBeenCalledTimes(2);
        expect(harness.select.mock.calls[1]?.[1]).toBe(true);
        expect(dataPoints[0]?.getAttribute("opacity")).toBe("0.8");
        expect(dataPoints[0]?.getAttribute("aria-pressed")).toBe("true");
        expect(dataPoints[1]?.getAttribute("aria-pressed")).toBe("true");
        expect(dataPoints[2]?.getAttribute("opacity")).toBe("0.3");
        expect(dataPoints[2]?.getAttribute("aria-pressed")).toBe("false");
    });

    it("honors hosts that disable visual interactions", () => {
        const staticHarness = createMockHost({ allowInteractions: false });
        const staticElement = document.createElement("div");
        const staticVisual = new Visual({
            element: staticElement,
            host: staticHarness.host
        } as VisualConstructorOptions);

        staticVisual.update(makeUpdateOptions(sampleDataView()));
        const dataPoint = staticElement.querySelector<SVGGraphicsElement>(".gantt-data-point");
        dataPoint?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        dataPoint?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

        expect(dataPoint?.classList.contains("is-selectable")).toBe(false);
        expect(dataPoint?.getAttribute("tabindex")).toBeNull();
        expect(dataPoint?.getAttribute("role")).toBe("img");
        expect(dataPoint?.getAttribute("aria-pressed")).toBeNull();
        expect(staticHarness.select).not.toHaveBeenCalled();
        expect(staticHarness.showContextMenu).not.toHaveBeenCalled();
    });

    it("keeps context menus accessible when selection is disabled", () => {
        visual.update(makeUpdateOptions(sampleDataView({
            objects: {
                interaction: {
                    enableSelection: false
                }
            } as powerbi.DataViewObjects
        })));
        const dataPoint = element.querySelector<SVGGraphicsElement>(".gantt-data-point");

        expect(dataPoint?.getAttribute("tabindex")).toBe("0");
        expect(dataPoint?.getAttribute("role")).toBe("img");
        expect(dataPoint?.getAttribute("aria-pressed")).toBeNull();
        dataPoint?.dispatchEvent(new KeyboardEvent("keydown", {
            key: "F10",
            shiftKey: true,
            bubbles: true
        }));
        expect(harness.showContextMenu).toHaveBeenCalledOnce();
    });

    it("supports both background and data-point context menus", () => {
        visual.update(makeUpdateOptions(sampleDataView()));
        const bodySvg = element.querySelector<SVGSVGElement>("svg.ganttBody");
        const firstDataPoint = element.querySelector<SVGGraphicsElement>(".gantt-data-point");

        bodySvg?.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            clientX: 12,
            clientY: 24
        }));
        firstDataPoint?.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            clientX: 30,
            clientY: 40
        }));

        expect(harness.showContextMenu).toHaveBeenCalledTimes(2);
        expect(isSelectionId(harness.showContextMenu.mock.calls[0]?.[0])).toBe(false);
        expect(isSelectionId(harness.showContextMenu.mock.calls[1]?.[0])).toBe(true);
        expect(harness.showContextMenu.mock.calls[1]?.[2]).toBe("task");
    });

    it("opens a data-point context menu with Shift+F10", () => {
        visual.update(makeUpdateOptions(sampleDataView()));
        const firstDataPoint = element.querySelector<SVGGraphicsElement>(".gantt-data-point");
        firstDataPoint?.dispatchEvent(new KeyboardEvent("keydown", {
            key: "F10",
            shiftKey: true,
            bubbles: true
        }));

        expect(harness.showContextMenu).toHaveBeenCalledOnce();
        expect(isSelectionId(harness.showContextMenu.mock.calls[0]?.[0])).toBe(true);
    });

    it("exposes formatted tooltip values with the matching identity", () => {
        visual.update(makeUpdateOptions(sampleDataView({
            tasks: ["Budget task"],
            startDates: ["2024-01-01"],
            endDates: ["2024-02-01"],
            progress: [0.5],
            categories: ["Phase 1"],
            formats: { progress: "0.0%" },
            tooltipMeasures: [
                { displayName: "Budget", values: [1234], format: "$#,0" }
            ]
        })));
        const dataPoint = element.querySelector<SVGGraphicsElement>(".gantt-data-point");
        dataPoint?.dispatchEvent(new MouseEvent("mouseover", {
            bubbles: true,
            clientX: 10,
            clientY: 20
        }));

        const tooltipOptions = harness.tooltipShow.mock.calls[0]?.[0] as powerbi.extensibility.TooltipShowOptions;
        expect(tooltipOptions.dataItems).toContainEqual({ displayName: "Progress", value: "50.0%" });
        expect(tooltipOptions.dataItems).toContainEqual({ displayName: "Budget", value: "$1,234" });
        expect((tooltipOptions.identities[0] as SelectionId).getKey()).toBe("selection-0");
    });

    it("omits unavailable progress from tooltips and accessible labels", () => {
        visual.update(makeUpdateOptions(sampleDataView({
            tasks: ["No progress"],
            startDates: ["2024-01-01"],
            endDates: ["2024-02-01"],
            progress: [null],
            categories: []
        })));
        const dataPoint = element.querySelector<SVGGraphicsElement>(".gantt-data-point");
        dataPoint?.dispatchEvent(new MouseEvent("mouseover", {
            bubbles: true,
            clientX: 10,
            clientY: 20
        }));

        const tooltipOptions = harness.tooltipShow.mock.calls[0]?.[0] as powerbi.extensibility.TooltipShowOptions;
        expect(tooltipOptions.dataItems.some(item => item.displayName === "Progress")).toBe(false);
        expect(dataPoint?.getAttribute("aria-label")).not.toContain(", progress ");
        expect(element.querySelector(".data-label")?.textContent).toBe("No progress");
    });

    it("applies and removes a model filter in filter interaction mode", async () => {
        visual.update(makeUpdateOptions(sampleDataView({
            taskQueryName: "ObsoleteTable.ObsoleteTask",
            taskExpression: {
                source: { entity: "ResolvedTable" },
                ref: "ResolvedTask"
            } as unknown as powerbi.data.ISQExpr,
            taskFieldParameterExpression: {
                source: { entity: "ParameterTable" },
                ref: "ParameterField"
            } as unknown as powerbi.data.ISQExpr,
            objects: {
                interaction: {
                    crossFilterMode: "filter"
                }
            } as powerbi.DataViewObjects
        })));
        const firstDataPoint = element.querySelector<SVGGraphicsElement>(".gantt-data-point");
        const bodySvg = element.querySelector<SVGSVGElement>("svg.ganttBody");

        firstDataPoint?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        const appliedFilter = harness.applyJsonFilter.mock.calls[0]?.[0] as {
            target: { table: string; column: string };
            values: string[];
        };
        expect(appliedFilter.target).toEqual({ table: "ResolvedTable", column: "ResolvedTask" });
        expect(appliedFilter.values).toEqual(["Design"]);
        expect(harness.applyJsonFilter.mock.calls[0]?.[3]).toBe(0);

        bodySvg?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        expect(harness.applyJsonFilter.mock.calls[1]?.[0]).toBeNull();
        expect(harness.applyJsonFilter.mock.calls[1]?.[3]).toBe(1);
    });

    it("restores and clears a persisted model filter", async () => {
        const updateOptions = makeUpdateOptions(sampleDataView({
            objects: {
                interaction: {
                    crossFilterMode: "filter"
                }
            } as powerbi.DataViewObjects
        }));
        updateOptions.jsonFilters = [{
            target: { table: "Table", column: "Task" },
            operator: "In",
            values: ["Develop"]
        } as unknown as powerbi.IFilter];

        visual.update(updateOptions);
        const dataPoints = element.querySelectorAll<SVGGraphicsElement>(".gantt-data-point");
        expect(dataPoints[0]?.getAttribute("aria-pressed")).toBe("false");
        expect(dataPoints[1]?.getAttribute("aria-pressed")).toBe("true");

        element.querySelector<SVGSVGElement>("svg.ganttBody")
            ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        expect(harness.applyJsonFilter).toHaveBeenCalledWith(
            null,
            "general",
            "filter",
            1
        );
    });

    it("clears a persisted filter from an empty-result landing page", () => {
        const updateOptions = makeUpdateOptions(sampleDataView({
            tasks: ["No valid row"],
            startDates: ["invalid"],
            endDates: ["invalid"],
            objects: {
                interaction: {
                    crossFilterMode: "filter"
                }
            } as powerbi.DataViewObjects
        }));
        updateOptions.jsonFilters = [{
            target: { table: "Table", column: "Task" },
            operator: "In",
            values: ["No valid row"]
        } as unknown as powerbi.IFilter];

        visual.update(updateOptions);
        const bodySvg = element.querySelector<SVGSVGElement>("svg.ganttBody");
        expect(bodySvg?.getAttribute("role")).toBe("button");
        expect(bodySvg?.getAttribute("tabindex")).toBe("0");
        expect(element.textContent).toContain("No tasks match the current filter");
        expect(element.textContent).toContain("press Enter to clear the task filter");
        expect(element.textContent).not.toContain("Add Task");

        bodySvg?.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true
        }));
        expect(harness.applyJsonFilter).toHaveBeenCalledWith(
            null,
            "general",
            "filter",
            1
        );
    });

    it("uses host high-contrast colors and selected outlines", () => {
        const highContrastHarness = createMockHost({
            instanceId: "high-contrast",
            highContrast: true
        });
        const highContrastElement = document.createElement("div");
        const highContrastVisual = new Visual({
            element: highContrastElement,
            host: highContrastHarness.host
        } as VisualConstructorOptions);

        highContrastVisual.update(makeUpdateOptions(sampleDataView()));
        const firstDataPoint = highContrastElement.querySelector<SVGGraphicsElement>(".gantt-data-point");
        expect(firstDataPoint?.getAttribute("fill")).toBe("#000000");
        expect(firstDataPoint?.getAttribute("stroke")).toBe("#ffffff");

        highContrastHarness.invokeSelectionCallback([createSelectionId(0)]);
        expect(firstDataPoint?.getAttribute("stroke")).toBe("#ffff00");
        expect(highContrastElement.style.getPropertyValue("--gantt-focus-color")).toBe("#ffff00");
    });

    it("uses host foreground text defaults for dark themes", () => {
        const darkHarness = createMockHost({
            foreground: "#f5f5f5",
            background: "#111111",
            foregroundSelected: "#00ffff"
        });
        const darkElement = document.createElement("div");
        const darkVisual = new Visual({
            element: darkElement,
            host: darkHarness.host
        } as VisualConstructorOptions);

        darkVisual.update(makeUpdateOptions(sampleDataView({
            objects: {
                title: {
                    show: true,
                    titleText: "Dark timeline"
                }
            } as powerbi.DataViewObjects
        })));

        expect(darkElement.querySelector(".chart-title")?.getAttribute("fill")).toBe("#f5f5f5");
        expect(darkElement.querySelector(".y-label")?.getAttribute("fill")).toBe("#f5f5f5");
        expect(darkElement.style.getPropertyValue("--gantt-focus-color")).toBe("#00ffff");
    });

    it("honors explicitly persisted text colors over host defaults", () => {
        visual.update(makeUpdateOptions(sampleDataView({
            objects: {
                title: {
                    show: true,
                    titleText: "Custom timeline",
                    fontColor: { solid: { color: "#123456" } }
                },
                categories: {
                    fontColor: { solid: { color: "#654321" } }
                }
            } as powerbi.DataViewObjects
        })));

        expect(element.querySelector(".chart-title")?.getAttribute("fill")).toBe("#123456");
        expect(element.querySelector(".y-label")?.getAttribute("fill")).toBe("#654321");
    });

    it("keeps multiple instances isolated and gives clip paths unique IDs", async () => {
        const secondHarness = createMockHost({ instanceId: "second-instance" });
        const secondElement = document.createElement("div");
        document.body.appendChild(secondElement);
        const secondVisual = new Visual({
            element: secondElement,
            host: secondHarness.host
        } as VisualConstructorOptions);

        visual.update(makeUpdateOptions(sampleDataView()));
        secondVisual.update(makeUpdateOptions(sampleDataView()));
        const firstIds = Array.from(element.querySelectorAll("clipPath"))
            .map(clip => clip.id);
        const secondIds = Array.from(secondElement.querySelectorAll("clipPath"))
            .map(clip => clip.id);

        element.querySelector<SVGGraphicsElement>(".gantt-data-point")
            ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        expect(new Set([...firstIds, ...secondIds]).size).toBe(firstIds.length + secondIds.length);
        expect(harness.select).toHaveBeenCalledOnce();
        expect(secondHarness.select).not.toHaveBeenCalled();
    });

    it("bounds hostile formatting values before rendering geometry", () => {
        visual.update(makeUpdateOptions(sampleDataView({
            objects: {
                chartSettings: {
                    barHeight: -1_000,
                    barCornerRadius: 1_000
                },
                design: {
                    barOpacity: 1_000
                }
            } as powerbi.DataViewObjects
        }), 200, 120));

        const dataPoint = element.querySelector<SVGRectElement>("rect.gantt-data-point");
        expect(Number(dataPoint?.getAttribute("height"))).toBeGreaterThanOrEqual(0);
        expect(Number(dataPoint?.getAttribute("height"))).toBeLessThanOrEqual(100);
        expect(Number(dataPoint?.getAttribute("opacity"))).toBeLessThanOrEqual(1);
    });

    it("allocates and truncates labels using the configured category font size", () => {
        visual.update(makeUpdateOptions(sampleDataView({
            tasks: ["Development"],
            startDates: ["2024-01-01"],
            endDates: ["2024-02-01"],
            objects: {
                categories: {
                    fontSize: 40
                }
            } as powerbi.DataViewObjects
        }), 600, 300));

        const transform = element.querySelector("g.chartContainer")?.getAttribute("transform") || "";
        const leftMargin = Number(/^translate\(([\d.]+),/.exec(transform)?.[1]);
        const label = element.querySelector<SVGTextElement>(".y-label")?.textContent || "";
        expect(leftMargin).toBeGreaterThanOrEqual(250);
        expect(label.endsWith("\u2026")).toBe(true);
    });
});

function isSelectionId(value: unknown): value is SelectionId {
    const candidate = value as Partial<SelectionId> | null | undefined;
    return typeof candidate?.getKey === "function";
}
