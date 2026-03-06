/**
 * Visual test bundle entry point.
 * Renders the Gantt chart in a browser with mock data.
 * Used by Playwright for visual screenshot testing.
 */
import * as d3 from "d3";
import { parseDataView, ParsedData } from "../src/dataParser";
import { GanttChart, GanttSettings, GanttDimensions } from "../src/ganttChart";

interface ScenarioData {
    tasks: string[];
    startDates: string[];
    endDates: string[];
    progress: number[];
    categories: string[];
}

const scenarios: Record<string, ScenarioData> = {
    standard: {
        tasks: ["Design", "Development", "Testing", "Deployment"],
        startDates: ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"],
        endDates: ["2024-01-31", "2024-03-15", "2024-03-31", "2024-04-15"],
        progress: [100, 75, 30, 0],
        categories: ["Phase 1", "Phase 1", "Phase 2", "Phase 2"]
    },
    multiTeam: {
        tasks: ["Dev Team", "Dev Team", "Dev Team", "Marketing", "Marketing", "QA Team", "QA Team", "QA Team", "QA Team", "Design", "Design"],
        startDates: ["2024-01-01", "2024-02-15", "2024-04-01", "2024-03-01", "2024-05-01", "2024-02-01", "2024-03-15", "2024-05-01", "2024-06-15", "2024-01-15", "2024-04-01"],
        endDates: ["2024-02-28", "2024-04-15", "2024-06-30", "2024-05-15", "2024-07-31", "2024-03-31", "2024-05-15", "2024-06-30", "2024-08-15", "2024-03-31", "2024-06-15"],
        progress: [100, 80, 40, 60, 10, 100, 90, 50, 0, 100, 70],
        categories: ["Backend", "Frontend", "API", "Campaign", "Social Media", "Unit Tests", "Integration", "Performance", "UAT", "UI Mockups", "Branding"]
    },
    manyRows: {
        tasks: Array.from({ length: 30 }, (_, i) => `Team ${Math.floor(i / 3) + 1}`),
        startDates: Array.from({ length: 30 }, (_, i) => {
            const d = new Date(2024, 0, 1 + i * 10);
            return d.toISOString().split("T")[0];
        }),
        endDates: Array.from({ length: 30 }, (_, i) => {
            const d = new Date(2024, 0, 21 + i * 10 + (i % 5) * 7);
            return d.toISOString().split("T")[0];
        }),
        progress: Array.from({ length: 30 }, (_, i) => (i * 17) % 100),
        categories: Array.from({ length: 30 }, (_, i) => `Activity ${String.fromCharCode(65 + (i % 10))}`)
    }
};

function buildMockDataView(input: ScenarioData): any {
    const taskColumn = { source: { displayName: "Task", queryName: "T.Task", type: { text: true }, roles: { task: true } }, values: input.tasks };
    const allCategories: any[] = [taskColumn];
    if (input.categories) {
        allCategories.push({ source: { displayName: "Category", queryName: "T.Category", type: { text: true }, roles: { category: true } }, values: input.categories });
    }
    const valueColumns: any[] = [
        { source: { displayName: "Start Date", queryName: "T.StartDate", roles: { startDate: true } }, values: input.startDates },
        { source: { displayName: "End Date", queryName: "T.EndDate", roles: { endDate: true } }, values: input.endDates }
    ];
    if (input.progress) {
        valueColumns.push({ source: { displayName: "Progress", queryName: "T.Progress", roles: { progress: true } }, values: input.progress });
    }
    return { categorical: { categories: allCategories, values: valueColumns }, metadata: { columns: allCategories.map((c: any) => c.source).concat(valueColumns.map((v: any) => v.source)) } };
}

function renderChart() {
    const params = new URLSearchParams(window.location.search);
    const scenario = params.get("scenario") || "standard";
    const data = scenarios[scenario] || scenarios.standard;

    const dv = buildMockDataView(data);
    const parsedData = parseDataView(dv);

    if (!parsedData) {
        document.getElementById("visual-container")!.textContent = "No data parsed";
        return;
    }

    const settings: GanttSettings = {
        showTodayLine: false,
        showGridLines: true,
        barHeight: 24,
        barCornerRadius: 4,
        categoryColors: ["#2196F3", "#FF9800", "#4CAF50", "#9C27B0", "#F44336", "#00BCD4", "#795548", "#607D8B", "#E91E63", "#009688"],
        progressColor: "#1565C0",
        todayLineColor: "#E53935",
        barOpacity: 80,
        title: { show: true, text: `Gantt - ${scenario}`, fontSize: 16, fontColor: "#333", alignment: "left" },
        dataLabels: { show: true, fontSize: 11, showProgress: true },
        categories: { show: true, fontSize: 11, fontColor: "#333" },
        legend: { show: true }
    };

    const longestName = parsedData.tasks.reduce((max, t) => t.name.length > max.length ? t.name : max, "");
    const leftMargin = Math.max(120, Math.min(longestName.length * 7 + 16, 900 * 0.35));

    const dimensions: GanttDimensions = { width: 900, height: 470, margin: { top: 10, right: 30, bottom: 0, left: leftMargin } };

    const headerG = d3.select("#header-svg").append("g") as any;
    const chartG = d3.select("#chart-svg").append("g").attr("class", "chartContainer") as any;

    const chart = new GanttChart(chartG, parsedData, settings, dimensions, headerG);
    chart.render();

    if (chart.requiredHeight > 470) {
        d3.select("#chart-svg").attr("height", chart.requiredHeight);
    }

    document.body.setAttribute("data-rendered", "true");
}

renderChart();
