/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from "vitest";
import * as d3 from "d3";
import { GanttChart, GanttSettings, GanttDimensions } from "../src/ganttChart";
import { ParsedData, parseDataView } from "../src/dataParser";
import { buildMockDataView } from "./helpers/mockDataView";

function defaultSettings(overrides: Partial<GanttSettings> = {}): GanttSettings {
    return {
        showTodayLine: true,
        showGridLines: true,
        barHeight: 24,
        barCornerRadius: 4,
        categoryColors: ["#2196F3", "#FF9800", "#4CAF50", "#9C27B0", "#F44336"],
        progressColor: "#1565C0",
        todayLineColor: "#E53935",
        barOpacity: 80,
        title: { show: false, text: "", fontSize: 16, fontColor: "#333", alignment: "left" },
        dataLabels: { show: true, fontSize: 11, showProgress: true },
        categories: { show: true, fontSize: 11, fontColor: "#333" },
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
let container: d3.Selection<SVGGElement, unknown, null, undefined>;

beforeEach(() => {
    const svgNs = "http://www.w3.org/2000/svg";
    svgEl = document.createElementNS(svgNs, "svg") as SVGSVGElement;
    svgEl.setAttribute("width", "800");
    svgEl.setAttribute("height", "400");
    document.body.appendChild(svgEl);

    const gEl = document.createElementNS(svgNs, "g");
    svgEl.appendChild(gEl);
    container = d3.select(gEl) as any;
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

    it("renders progress overlay bars for tasks with progress > 0", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        const progressBars = container.selectAll("rect.gantt-progress").size();
        // Design=100%, Development=75%, Testing=30%; Deployment=0% (excluded)
        expect(progressBars).toBe(3);
    });

    it("bars have data-dp-index attributes", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        const indexed = container.selectAll("rect[data-dp-index]").size();
        expect(indexed).toBeGreaterThan(0);
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
            const el = d3.select(this);
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
        expect(container.selectAll(".data-label").size()).toBe(4);
    });

    it("data labels hidden when disabled", () => {
        const settings = defaultSettings({ dataLabels: { show: false, fontSize: 11, showProgress: true } });
        new GanttChart(container, sampleData(), settings, defaultDimensions()).render();
        expect(container.selectAll(".data-label").size()).toBe(0);
    });

    it("data labels include progress percentage when showProgress is true", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        const labels: string[] = [];
        container.selectAll(".data-label").each(function() {
            labels.push(d3.select(this).text());
        });
        // Design has 100% progress
        expect(labels[0]).toContain("100%");
    });

    it("bars are color-coded by category", () => {
        new GanttChart(container, sampleData(), defaultSettings(), defaultDimensions()).render();
        const colors = new Set<string>();
        container.selectAll("rect.gantt-bar").each(function() {
            colors.add(d3.select(this).attr("fill"));
        });
        // Phase 1 and Phase 2 should have different colors
        expect(colors.size).toBe(2);
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
});
