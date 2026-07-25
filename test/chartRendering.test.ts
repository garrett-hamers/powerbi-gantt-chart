/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { select, Selection } from "d3-selection";
import { GanttChart, GanttSettings, GanttDimensions } from "../src/ganttChart";
import { GanttTask, ParsedData, parseDataView } from "../src/dataParser";
import { buildMockDataView } from "./helpers/mockDataView";

function defaultSettings(overrides: Partial<GanttSettings> = {}): GanttSettings {
    return {
        instanceId: "chart-test",
        interactionsEnabled: true,
        selectionEnabled: true,
        showTodayLine: true,
        showGridLines: true,
        barHeight: 24,
        barCornerRadius: 4,
        categoryColors: ["#2196F3", "#FF9800", "#4CAF50", "#9C27B0", "#F44336"],
        progressColor: "#1565C0",
        todayLineColor: "#E53935",
        foregroundColor: "#333333",
        gridColor: "#e0e0e0",
        barOpacity: 80,
        highContrast: {
            isActive: false,
            foreground: "#000000",
            background: "#ffffff",
            foregroundSelected: "#ffff00"
        },
        title: { show: false, text: "", fontSize: 16, fontColor: "#333", alignment: "left" },
        dataLabels: { show: true, fontSize: 11, showProgress: true },
        categories: { show: true, fontSize: 11, fontColor: "#333" },
        legend: { show: false },
        ...overrides
    };
}

function defaultDimensions(): GanttDimensions {
    return { width: 800, height: 400, margin: { top: 10, right: 30, bottom: 30, left: 120 } };
}

function sampleData(): ParsedData {
    const dv = buildMockDataView({
        tasks: ["Design", "Development", "Testing", "Deployment"],
        startDates: ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"],
        endDates: ["2024-01-31", "2024-03-15", "2024-03-31", "2024-04-15"],
        progress: [100, 75, 30, 0],
        categories: ["Phase 1", "Phase 1", "Phase 2", "Phase 2"]
    });
    return parseDataView(dv)!;
}

let svgEl: SVGSVGElement;
let container: Selection<SVGGElement, unknown, null, undefined>;

beforeEach(() => {
    document.body.replaceChildren();
    const svgNs = "http://www.w3.org/2000/svg";
    svgEl = document.createElementNS(svgNs, "svg") as SVGSVGElement;
    svgEl.setAttribute("width", "800");
    svgEl.setAttribute("height", "400");
    document.body.appendChild(svgEl);

    const gEl = document.createElementNS(svgNs, "g");
    svgEl.appendChild(gEl);
    container = select(gEl);
});

describe("Gantt chart rendering", () => {
    it("renders without throwing", () => {
        expect(() => {
            new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        }).not.toThrow();
    });

    it("produces SVG child elements", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        expect(container.selectAll("*").size()).toBeGreaterThan(0);
    });

    it("renders rect elements for task bars", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        const bars = container.selectAll("rect.gantt-bar").size();
        expect(bars).toBe(4);
    });

    it("renders configured progress overlays, including completed tasks", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        const progressBars = container.selectAll("rect.gantt-progress").size();
        expect(progressBars).toBe(3);
        expect(container.select("rect.gantt-progress").attr("fill")).toBe("#1565C0");
    });

    it("bars have data-dp-index attributes", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        const indexed = container.selectAll("rect[data-dp-index]").size();
        expect(indexed).toBeGreaterThan(0);
    });

    it("makes every data point keyboard focusable with an accessible label", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        const firstBar = container.select<SVGGraphicsElement>(".gantt-data-point");

        expect(firstBar.attr("tabindex")).toBe("0");
        expect(firstBar.attr("role")).toBe("button");
        expect(firstBar.attr("aria-label")).toContain("Design");
        expect(firstBar.attr("aria-keyshortcuts")).toContain("Shift+F10");
    });

    it("renders today line when enabled", () => {
        // Use a date range that includes today
        const today = new Date();
        const start = new Date(today.getTime() - 30 * 86400000);
        const end = new Date(today.getTime() + 30 * 86400000);
        const dv = buildMockDataView({
            tasks: ["Task"],
            startDates: [start.toISOString()],
            endDates: [end.toISOString()]
        });
        const data = parseDataView(dv)!;
        new GanttChart(container, data, defaultSettings(), defaultDimensions()).render();
        const todayLine = container.selectAll(".today-line").size();
        expect(todayLine).toBe(1);
    });

    it("hides today line when disabled", () => {
        const today = new Date();
        const start = new Date(today.getTime() - 30 * 86400000);
        const end = new Date(today.getTime() + 30 * 86400000);
        const dv = buildMockDataView({
            tasks: ["Task"],
            startDates: [start.toISOString()],
            endDates: [end.toISOString()]
        });
        const data = parseDataView(dv)!;
        const settings = defaultSettings({ showTodayLine: false });
        new GanttChart(container, data, settings, defaultDimensions()).render();
        expect(container.selectAll(".today-line").size()).toBe(0);
    });

    it("renders grid lines when enabled", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        const gridLines = container.selectAll(".grid-line").size();
        expect(gridLines).toBeGreaterThan(0);
    });

    it("hides grid lines when disabled", () => {
        const settings = defaultSettings({ showGridLines: false });
        new GanttChart(container, sampleData(), settings, defaultDimensions()).render();
        expect(container.selectAll(".grid-line").size()).toBe(0);
    });

    it("no NaN in SVG attributes", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        let hasNaN = false;
        container.selectAll("*").each(function() {
            const el = select(this);
            for (const attr of ["x", "y", "width", "height", "x1", "y1", "x2", "y2"]) {
                const val = el.attr(attr);
                if (val && val.includes("NaN")) hasNaN = true;
            }
            const d = el.attr("d");
            if (d && d.includes("NaN")) hasNaN = true;
            const transform = el.attr("transform");
            if (transform && transform.includes("NaN")) hasNaN = true;
        });
        expect(hasNaN).toBe(false);
    });

    it("data labels render when enabled", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        expect(container.selectAll(".data-label-base").size()).toBe(4);
        expect(container.selectAll(".data-label-progress").size()).toBe(3);
    });

    it("data labels hidden when disabled", () => {
        const settings = defaultSettings({ dataLabels: { show: false, fontSize: 11, showProgress: true } });
        new GanttChart(container, sampleData(), settings, defaultDimensions()).render();
        expect(container.selectAll(".data-label").size()).toBe(0);
    });

    it("data labels include progress percentage when showProgress is true", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        const labels: string[] = [];
        container.selectAll(".data-label-base").each(function() {
            labels.push(select(this).text());
        });
        // Design has 100% progress
        expect(labels[0]).toContain("100%");
    });

    it("omits unavailable progress from overlays, labels, and ARIA", () => {
        const data = parseDataView(buildMockDataView({
            tasks: ["Missing", "Invalid", "Zero"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
            endDates: ["2024-01-31", "2024-02-28", "2024-03-31"],
            progress: [null, "invalid", 0]
        }))!;

        new GanttChart(container, data, defaultSettings(), defaultDimensions()).render();
        const labels = container.selectAll<SVGTextElement, GanttTask>(".data-label-base").nodes()
            .map(label => label.textContent);
        const ariaLabels = container.selectAll<SVGGraphicsElement, GanttTask>(".gantt-data-point").nodes()
            .map(dataPoint => dataPoint.getAttribute("aria-label"));

        expect(container.selectAll(".gantt-progress").size()).toBe(0);
        expect(labels).toEqual(["Missing", "Invalid", "Zero (0%)"]);
        expect(ariaLabels[0]).not.toContain("progress");
        expect(ariaLabels[1]).not.toContain("progress");
        expect(ariaLabels[2]).toContain("progress 0%");
    });

    it("bars are color-coded by category", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        const colors = new Set<string>();
        container.selectAll("rect.gantt-bar").each(function() {
            colors.add(select(this).attr("fill"));
        });
        // Phase 1 and Phase 2 should have different colors
        expect(colors.size).toBe(2);
    });

    it("dims only rows excluded by an incoming cross-highlight", () => {
        const data = parseDataView(buildMockDataView({
            tasks: ["Dim", "Keep"],
            startDates: ["2024-01-01", "2024-02-01"],
            endDates: ["2024-01-31", "2024-02-28"],
            highlights: {
                startDates: [null, "2024-02-01"]
            }
        }))!;

        new GanttChart(container, data, defaultSettings(), defaultDimensions()).render();
        const opacity = Array.from(container.selectAll<SVGGraphicsElement, unknown>(".gantt-data-point"))
            .map(element => Number(element.getAttribute("opacity")));
        expect(opacity).toEqual([0.3, 0.8]);
    });

    it("uses host high-contrast colors for data, text, and outlines", () => {
        const settings = defaultSettings({
            highContrast: {
                isActive: true,
                foreground: "#ffffff",
                background: "#000000",
                foregroundSelected: "#ffff00"
            }
        });

        new GanttChart(container, sampleData(), settings, defaultDimensions()).render();
        const firstBar = container.select(".gantt-data-point");
        expect(firstBar.attr("fill")).toBe("#000000");
        expect(firstBar.attr("stroke")).toBe("#ffffff");
        expect(firstBar.attr("stroke-width")).toBe("2");
        expect(container.select(".x-axis text").attr("fill")).toBe("#ffffff");
        expect(container.select(".data-label-base").attr("fill")).toBe("#ffffff");
        expect(container.select(".data-label-progress").attr("fill")).toBe("#000000");
    });

    it("uses accessible high-contrast opacity for cross-highlighted rows", () => {
        const data = parseDataView(buildMockDataView({
            tasks: ["Dim", "Keep"],
            startDates: ["2024-01-01", "2024-02-01"],
            endDates: ["2024-01-31", "2024-02-28"],
            progress: [50, 50],
            highlights: {
                startDates: [null, "2024-02-01"]
            }
        }))!;
        const settings = defaultSettings({
            highContrast: {
                isActive: true,
                foreground: "#ffffff",
                background: "#000000",
                foregroundSelected: "#ffff00"
            }
        });

        new GanttChart(container, data, settings, defaultDimensions()).render();
        const barOpacity = container.selectAll<SVGGraphicsElement, unknown>(".gantt-data-point")
            .nodes()
            .map(element => Number(element.getAttribute("opacity")));
        const progressOpacity = container.selectAll<SVGRectElement, unknown>(".gantt-progress")
            .nodes()
            .map(element => Number(element.getAttribute("opacity")));
        expect(barOpacity).toEqual([0.6, 1]);
        expect(progressOpacity).toEqual([0.6, 1]);
    });
});

describe("Title rendering", () => {
    it("renders title when enabled", () => {
        const settings = defaultSettings({
            title: { show: true, text: "Project Timeline", fontSize: 16, fontColor: "#333", alignment: "center" }
        });
        new GanttChart(container, sampleData(), settings, defaultDimensions()).render();
        const title = container.selectAll(".chart-title");
        expect(title.size()).toBe(1);
        expect(title.text()).toBe("Project Timeline");
    });

    it("hides title when disabled", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        expect(container.selectAll(".chart-title").size()).toBe(0);
    });
});

describe("Edge cases", () => {
    it("handles single task", () => {
        const dv = buildMockDataView({
            tasks: ["Solo"],
            startDates: ["2024-01-01"],
            endDates: ["2024-12-31"]
        });
        expect(() => {
            new GanttChart(container, parseDataView(dv)!, defaultSettings(), defaultDimensions()).render();
        }).not.toThrow();
    });

    it("handles tasks with same dates", () => {
        const dv = buildMockDataView({
            tasks: ["A", "B"],
            startDates: ["2024-01-01", "2024-01-01"],
            endDates: ["2024-06-01", "2024-06-01"]
        });
        expect(() => {
            new GanttChart(container, parseDataView(dv)!, defaultSettings(), defaultDimensions()).render();
        }).not.toThrow();
    });

    it("renders zero-duration tasks as visible milestone diamonds", () => {
        const data = parseDataView(buildMockDataView({
            tasks: ["Release"],
            startDates: ["2024-06-01"],
            endDates: ["2024-06-01"]
        }))!;

        new GanttChart(container, data, defaultSettings(), defaultDimensions()).render();
        expect(container.selectAll("rect.gantt-bar").size()).toBe(0);
        expect(container.selectAll("path.gantt-milestone").size()).toBe(1);
        expect(container.select("path.gantt-milestone").attr("d")).not.toContain("NaN");
    });

    it("keeps mixed bars and milestones in visual row order for keyboard traversal", () => {
        const data = parseDataView(buildMockDataView({
            tasks: ["First", "Milestone", "Third"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
            endDates: ["2024-01-31", "2024-02-01", "2024-03-31"]
        }))!;

        new GanttChart(container, data, defaultSettings(), defaultDimensions()).render();
        const rowOrder = container.selectAll<SVGGraphicsElement, GanttTask>(".gantt-data-point")
            .nodes()
            .map(element => element.getAttribute("data-dp-index"));
        expect(rowOrder).toEqual(["0", "1", "2"]);
    });

    it("progress bar width is proportional to progress percentage", () => {
        const dv = buildMockDataView({
            tasks: ["Half"],
            startDates: ["2024-01-01"],
            endDates: ["2024-12-31"],
            progress: [50]
        });
        new GanttChart(container, parseDataView(dv)!, defaultSettings(), defaultDimensions()).render();
        const barWidth = parseFloat(container.select("rect.gantt-bar").attr("width"));
        const progressWidth = parseFloat(container.select("rect.gantt-progress").attr("width"));
        // Progress should be approximately half the bar width
        expect(progressWidth).toBeCloseTo(barWidth * 0.5, 0);
    });

    it("matches large rounded label clips to partial-progress geometry", () => {
        const data = parseDataView(buildMockDataView({
            tasks: ["Rounded partial progress"],
            startDates: ["2024-01-01"],
            endDates: ["2024-04-01"],
            progress: [10]
        }))!;
        const settings = defaultSettings({ barHeight: 32, barCornerRadius: 16 });

        new GanttChart(container, data, settings, defaultDimensions()).render();
        const progress = container.select<SVGRectElement>(".gantt-progress");
        const progressLabel = container.select<SVGTextElement>(".data-label-progress");
        const baseLabel = container.select<SVGTextElement>(".data-label-base");
        const clipRadius = (label: Selection<SVGTextElement, unknown, null, undefined>): string => {
            const clipId = /url\(#([^)]+)\)/.exec(label.attr("clip-path"))?.[1];
            return clipId ? container.select(`#${clipId} rect`).attr("rx") : "";
        };

        expect(progress.attr("rx")).toBe("16");
        expect(clipRadius(progressLabel)).toBe("16");
        expect(clipRadius(baseLabel)).toBe("16");
    });

    it("reports enough height for thousands-style scrolling without invalid geometry", () => {
        const tasks = Array.from({ length: 200 }, (_, index) => `Task ${index}`);
        const data = parseDataView(buildMockDataView({
            tasks,
            startDates: tasks.map(() => "2024-01-01"),
            endDates: tasks.map(() => "2024-02-01")
        }))!;
        const chart = new GanttChart(
            container,
            data,
            defaultSettings(),
            { width: 320, height: 120, margin: { top: 10, right: 10, bottom: 0, left: 80 } }
        );

        chart.render();
        expect(chart.requiredHeight).toBeGreaterThan(5_000);
        expect(container.selectAll(".gantt-data-point").size()).toBe(200);
    });

    it("uses instance-scoped clip path IDs", () => {
        const settingsA = defaultSettings({ instanceId: "instance/A" });
        const settingsB = defaultSettings({ instanceId: "instance/B" });
        const secondGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        svgEl.appendChild(secondGroup);
        const secondContainer = select(secondGroup);

        new GanttChart(container, sampleData(), settingsA, defaultDimensions()).render();
        new GanttChart(secondContainer, sampleData(), settingsB, defaultDimensions()).render();

        const firstIds = Array.from(container.selectAll("clipPath"))
            .map(element => element.getAttribute("id"));
        const secondIds = Array.from(secondContainer.selectAll("clipPath"))
            .map(element => element.getAttribute("id"));
        expect(firstIds).not.toEqual(secondIds);
        expect(new Set([...firstIds, ...secondIds]).size).toBe(firstIds.length + secondIds.length);
    });
});
