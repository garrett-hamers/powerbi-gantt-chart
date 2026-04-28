import * as d3 from "d3";
import { parseDataView } from "../src/dataParser";
import { GanttChart, GanttSettings, GanttDimensions } from "../src/ganttChart";
import { createMockHost } from "./mocks/host";
import { Visual as __TooltipVisual } from "../src/visual";
import { createMockHost as __createTooltipMockHost, MockHost as __TooltipMockHost } from "./mocks/host";

interface ScenarioData {
    tasks: string[];
    startDates: string[];
    endDates: string[];
    progress: number[];
    categories: string[];
    title: string;
}

function iso(d: Date): string {
    return d.toISOString().split("T")[0];
}

function addDays(base: Date, days: number): Date {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() + days);
    return d;
}

// Anchor scenarios around "today" so the today-line falls inside the date range.
const today = new Date();

const standardScenario: ScenarioData = (() => {
    const taskNames = [
        "Requirements", "Architecture",
        "Backend Dev", "Frontend Dev",
        "Unit Tests", "Integration Tests",
        "Staging Deploy", "Production Launch"
    ];
    const categories = [
        "Planning", "Planning",
        "Dev", "Dev",
        "QA", "QA",
        "Launch", "Launch"
    ];
    const offsets = [-40, -30, -20, -10, 0, 10, 20, 30];
    const durations = [14, 14, 21, 21, 14, 14, 10, 7];
    const progress = [100, 100, 90, 70, 50, 20, 5, 0];
    return {
        tasks: taskNames,
        categories,
        startDates: offsets.map(o => iso(addDays(today, o))),
        endDates: offsets.map((o, i) => iso(addDays(today, o + durations[i]))),
        progress,
        title: "Software Release Project"
    };
})();

const multiTeamScenario: ScenarioData = (() => {
    const tasks: string[] = [];
    const categories: string[] = [];
    const startDates: string[] = [];
    const endDates: string[] = [];
    const progress: number[] = [];

    const groups: Array<{ name: string; cat: string; count: number }> = [
        { name: "Engineering", cat: "Engineering", count: 5 },
        { name: "Design", cat: "Design", count: 5 },
        { name: "Marketing", cat: "Marketing", count: 5 }
    ];

    let idx = 0;
    for (const group of groups) {
        for (let i = 0; i < group.count; i++) {
            tasks.push(`${group.name} Task ${i + 1}`);
            categories.push(group.cat);
            const startOffset = -45 + idx * 5;
            const duration = 20 + ((idx * 7) % 15);
            startDates.push(iso(addDays(today, startOffset)));
            endDates.push(iso(addDays(today, startOffset + duration)));
            progress.push((idx * 13) % 101);
            idx++;
        }
    }
    return { tasks, categories, startDates, endDates, progress, title: "Multi-Team Overlap" };
})();

const manyRowsScenario: ScenarioData = (() => {
    const n = 30;
    const tasks = Array.from({ length: n }, (_, i) => `Task ${i + 1}`);
    const categories = Array.from({ length: n }, (_, i) => `Group ${String.fromCharCode(65 + (i % 5))}`);
    const startDates = Array.from({ length: n }, (_, i) => iso(addDays(today, -60 + i * 4)));
    const endDates = Array.from({ length: n }, (_, i) => iso(addDays(today, -60 + i * 4 + 10 + (i % 7))));
    const progress = Array.from({ length: n }, (_, i) => (i * 17) % 100);
    return { tasks, categories, startDates, endDates, progress, title: "Density Test (30 tasks)" };
})();

function buildMockDataView(input: ScenarioData): any {
    const taskColumn = {
        source: { displayName: "Task", queryName: "T.Task", type: { text: true }, roles: { task: true } },
        values: input.tasks
    };
    const categoryColumn = {
        source: { displayName: "Category", queryName: "T.Category", type: { text: true }, roles: { category: true } },
        values: input.categories
    };
    const valueColumns = [
        { source: { displayName: "Start Date", queryName: "T.StartDate", roles: { startDate: true } }, values: input.startDates },
        { source: { displayName: "End Date", queryName: "T.EndDate", roles: { endDate: true } }, values: input.endDates },
        { source: { displayName: "Progress", queryName: "T.Progress", roles: { progress: true } }, values: input.progress }
    ];
    return {
        categorical: { categories: [taskColumn, categoryColumn], values: valueColumns },
        metadata: { columns: [] }
    };
}

function isPlainObject(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function deepMerge<T>(base: T, override: any): T {
    if (!isPlainObject(override)) return base;
    const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
    for (const k of Object.keys(override)) {
        out[k] = isPlainObject(out[k]) && isPlainObject(override[k])
            ? deepMerge(out[k], override[k]) : override[k];
    }
    return out;
}

function defaultSettings(titleText = ""): GanttSettings {
    return {
        showTodayLine: true,
        showGridLines: true,
        barHeight: 18,
        barCornerRadius: 3,
        categoryColors: ["#2196F3", "#FF9800", "#4CAF50", "#9C27B0", "#F44336", "#00BCD4", "#795548", "#607D8B"],
        progressColor: "#1565C0",
        todayLineColor: "#E53935",
        barOpacity: 80,
        title: { show: true, text: titleText, fontSize: 13, fontColor: "#333", alignment: "left" },
        dataLabels: { show: true, fontSize: 10, showProgress: true },
        categories: { show: true, fontSize: 10, fontColor: "#333" },
        legend: { show: true }
    };
}

export interface MountConfig {
    containerId: string;
    dataView: any;
    settings?: Record<string, any>;
    host?: any;
    dimensions?: { width: number; height: number };
}

export interface MountHandle {
    update: (config: Partial<MountConfig>) => void;
    unmount: () => void;
    getContainer: () => HTMLElement;
}

export function mountVisual(config: MountConfig): MountHandle {
    const container = document.getElementById(config.containerId);
    if (!container) throw new Error(`Container #${config.containerId} not found`);
    let current: MountConfig = config;

    function render(cfg: MountConfig) {
        container.innerHTML = "";
        try {
            const parsed = parseDataView(cfg.dataView);
            if (!parsed) {
                d3.select(container).append("div").style("color", "red").text("No data parsed");
                return;
            }
            const settings = deepMerge(defaultSettings(), cfg.settings || {});
            const longestName = parsed.tasks.reduce((max, t) => t.name.length > max.length ? t.name : max, "");
            const leftMargin = Math.max(100, Math.min(longestName.length * 7 + 16, 220));
            const dimensions: GanttDimensions = {
                width: cfg.dimensions?.width ?? 900,
                height: cfg.dimensions?.height ?? 360,
                margin: { top: 10, right: 30, bottom: 10, left: leftMargin }
            };
            const wrapperSvg = d3.select(container).append("svg")
                .attr("width", dimensions.width)
                .attr("height", dimensions.height)
                .classed("ganttChart", true);
            const headerG = wrapperSvg.append("g").classed("headerContainer", true) as any;
            const chartG = wrapperSvg.append("g").classed("chartContainer", true) as any;
            const chart = new GanttChart(chartG, parsed, settings, dimensions, headerG);
            chart.render();
            if (chart.requiredHeight > dimensions.height) {
                wrapperSvg.attr("height", chart.requiredHeight);
            }
        } catch (e) {
            console.error(cfg.containerId, e);
            d3.select(container).append("div").style("color", "red").text("Error: " + (e as Error).message);
        }
    }

    render(current);
    return {
        update(next) {
            current = { ...current, ...next, settings: deepMerge(current.settings || {}, next.settings || {}) } as MountConfig;
            render(current);
        },
        unmount() { container.innerHTML = ""; },
        getContainer() { return container; }
    };
}

(window as any).__mountVisual = mountVisual;

function renderScenario(containerId: string, scenario: ScenarioData, height: number) {
    mountVisual({
        containerId,
        dataView: buildMockDataView(scenario),
        settings: { title: { text: scenario.title } },
        dimensions: { width: 900, height }
    });
}

renderScenario("standard", standardScenario, 360);
renderScenario("multiTeam", multiTeamScenario, 520);
renderScenario("manyRows", manyRowsScenario, 900);

document.body.setAttribute("data-rendered", "true");
(window as any).__visualsReady = true;

/* ─────────────────────────────────────────────────────────────
 * Tooltip-test harness — mounts the REAL Visual class with
 * createMockHost() so tooltipService.show/move/hide are recorded
 * as spy calls. Used exclusively by tooltip.playwright.spec.ts.
 * ───────────────────────────────────────────────────────────── */
(window as any).__mockHosts = (window as any).__mockHosts || {};
(window as any).__mountWithHost = function(
    containerId: string,
    dataView: any,
    opts?: { width?: number; height?: number }
): __TooltipMockHost {
    let el = document.getElementById(containerId);
    if (!el) {
        el = document.createElement("div");
        el.id = containerId;
        el.style.position = "absolute";
        el.style.left = "0";
        el.style.top = "0";
        el.style.width = (opts?.width ?? 640) + "px";
        el.style.height = (opts?.height ?? 360) + "px";
        el.setAttribute("data-tooltip-host", "true");
        document.body.appendChild(el);
    } else {
        el.innerHTML = "";
    }
    const host = __createTooltipMockHost();
    (window as any).__mockHosts[containerId] = host;
    const visual = new __TooltipVisual({ host, element: el } as any);
    visual.update({
        dataViews: [dataView],
        viewport: { width: opts?.width ?? 640, height: opts?.height ?? 360 },
        type: 2,
        viewMode: 0,
        editMode: 0,
        isInFocus: false,
        operationKind: 0,
        jsonFilters: []
    } as any);
    return host;
};

// Expose default dataView for selection tests
(window as any).__defaultDataView = buildMockDataView(standardScenario);
