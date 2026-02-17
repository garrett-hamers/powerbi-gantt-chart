/**
 * Gantt Chart — D3-based timeline renderer
 */
import * as d3 from "d3";
import { GanttTask, ParsedData } from "./dataParser";
import { getCategoryColor } from "./utils/colors";

export interface GanttSettings {
    showTodayLine: boolean;
    showGridLines: boolean;
    barHeight: number;
    barCornerRadius: number;
    categoryColors: string[];
    progressColor: string;
    todayLineColor: string;
    barOpacity: number;
    title: {
        show: boolean;
        text: string;
        fontSize: number;
        fontColor: string;
        alignment: "left" | "center" | "right";
    };
    dataLabels: {
        show: boolean;
        fontSize: number;
        showProgress: boolean;
    };
    categories: {
        show: boolean;
        fontSize: number;
        fontColor: string;
    };
}

export interface GanttDimensions {
    width: number;
    height: number;
    margin: { top: number; right: number; bottom: number; left: number };
}

export class GanttChart {
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private data: ParsedData;
    private settings: GanttSettings;
    private dimensions: GanttDimensions;

    constructor(
        container: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: ParsedData,
        settings: GanttSettings,
        dimensions: GanttDimensions
    ) {
        this.container = container;
        this.data = data;
        this.settings = settings;
        this.dimensions = dimensions;
    }

    private get chartWidth(): number {
        return this.dimensions.width - this.dimensions.margin.left - this.dimensions.margin.right;
    }

    private get chartHeight(): number {
        return this.dimensions.height - this.dimensions.margin.top - this.dimensions.margin.bottom;
    }

    render(): void {
        if (this.chartWidth <= 0 || this.chartHeight <= 0) return;

        const margin = this.dimensions.margin;
        this.container.attr("transform", `translate(${margin.left},${margin.top})`);

        let chartTop = 0;
        if (this.settings.title.show && this.settings.title.text) {
            this.renderTitle();
            chartTop += this.settings.title.fontSize + 10;
        }

        const effectiveHeight = this.chartHeight - chartTop;
        if (effectiveHeight <= 0) return;

        // Build category-to-index map for coloring
        const categoryMap = new Map<string, number>();
        this.data.categories.forEach((cat, i) => categoryMap.set(cat, i));

        // Add time padding (5% on each side)
        const timeRange = this.data.maxDate.getTime() - this.data.minDate.getTime();
        const padding = Math.max(timeRange * 0.05, 86400000); // at least 1 day
        const paddedMin = new Date(this.data.minDate.getTime() - padding);
        const paddedMax = new Date(this.data.maxDate.getTime() + padding);

        // X scale: time
        const xScale = d3.scaleTime()
            .domain([paddedMin, paddedMax])
            .range([0, this.chartWidth]);

        // Y scale: task names
        const taskNames = this.data.tasks.map(t => t.name);
        const yScale = d3.scaleBand()
            .domain(taskNames)
            .range([chartTop, chartTop + effectiveHeight])
            .padding(0.2);

        // Grid lines
        if (this.settings.showGridLines) {
            const ticks = xScale.ticks();
            this.container.selectAll("line.grid-line")
                .data(ticks)
                .enter()
                .append("line")
                .attr("class", "grid-line")
                .attr("x1", (d: Date) => xScale(d))
                .attr("x2", (d: Date) => xScale(d))
                .attr("y1", chartTop)
                .attr("y2", chartTop + effectiveHeight)
                .attr("stroke", "#e0e0e0")
                .attr("stroke-width", 1)
                .attr("stroke-dasharray", "2,2");
        }

        // X axis
        const xAxis = d3.axisBottom(xScale).ticks(6);
        this.container.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${chartTop + effectiveHeight})`)
            .call(xAxis as any);

        // Y axis (task labels)
        if (this.settings.categories.show) {
            const yAxis = d3.axisLeft(yScale);
            this.container.append("g")
                .attr("class", "y-axis")
                .call(yAxis as any)
                .selectAll("text")
                .attr("font-size", `${this.settings.categories.fontSize}px`)
                .attr("fill", this.settings.categories.fontColor);
        }

        // Task bars
        const barHeight = Math.min(this.settings.barHeight, yScale.bandwidth());

        this.container.selectAll("rect.gantt-bar")
            .data(this.data.tasks)
            .enter()
            .append("rect")
            .attr("class", "gantt-bar")
            .attr("data-dp-index", (d: GanttTask) => String(d.rowIndex))
            .attr("x", (d: GanttTask) => xScale(d.startDate))
            .attr("y", (d: GanttTask) => {
                const bandY = yScale(d.name) ?? 0;
                return bandY + (yScale.bandwidth() - barHeight) / 2;
            })
            .attr("width", (d: GanttTask) => Math.max(0, xScale(d.endDate) - xScale(d.startDate)))
            .attr("height", barHeight)
            .attr("rx", this.settings.barCornerRadius)
            .attr("fill", (d: GanttTask) => {
                if (d.category && categoryMap.has(d.category)) {
                    return getCategoryColor(categoryMap.get(d.category)!, this.settings.categoryColors);
                }
                return getCategoryColor(0, this.settings.categoryColors);
            })
            .attr("opacity", this.settings.barOpacity / 100);

        // Progress overlay bars
        this.container.selectAll("rect.gantt-progress")
            .data(this.data.tasks.filter(t => t.progress > 0))
            .enter()
            .append("rect")
            .attr("class", "gantt-progress")
            .attr("data-dp-index", (d: GanttTask) => String(d.rowIndex))
            .attr("x", (d: GanttTask) => xScale(d.startDate))
            .attr("y", (d: GanttTask) => {
                const bandY = yScale(d.name) ?? 0;
                return bandY + (yScale.bandwidth() - barHeight) / 2;
            })
            .attr("width", (d: GanttTask) => {
                const fullWidth = Math.max(0, xScale(d.endDate) - xScale(d.startDate));
                return fullWidth * (d.progress / 100);
            })
            .attr("height", barHeight)
            .attr("rx", this.settings.barCornerRadius)
            .attr("fill", this.settings.progressColor)
            .attr("opacity", this.settings.barOpacity / 100)
            .attr("pointer-events", "none");

        // Data labels
        if (this.settings.dataLabels.show) {
            this.container.selectAll("text.data-label")
                .data(this.data.tasks)
                .enter()
                .append("text")
                .attr("class", "data-label")
                .attr("x", (d: GanttTask) => xScale(d.startDate) + 4)
                .attr("y", (d: GanttTask) => {
                    const bandY = yScale(d.name) ?? 0;
                    return bandY + yScale.bandwidth() / 2;
                })
                .attr("dy", "0.35em")
                .attr("font-size", `${this.settings.dataLabels.fontSize}px`)
                .attr("fill", "#fff")
                .text((d: GanttTask) => {
                    if (this.settings.dataLabels.showProgress && d.progress > 0) {
                        return `${d.name} (${Math.round(d.progress)}%)`;
                    }
                    return d.name;
                });
        }

        // Today line
        if (this.settings.showTodayLine) {
            const today = new Date();
            if (today >= paddedMin && today <= paddedMax) {
                this.container.append("line")
                    .attr("class", "today-line")
                    .attr("x1", xScale(today))
                    .attr("x2", xScale(today))
                    .attr("y1", chartTop)
                    .attr("y2", chartTop + effectiveHeight)
                    .attr("stroke", this.settings.todayLineColor)
                    .attr("stroke-width", 2)
                    .attr("stroke-dasharray", "6,3");
            }
        }
    }

    private renderTitle(): void {
        const { title } = this.settings;
        if (!title.show || !title.text) return;

        const x = title.alignment === "center" ? this.chartWidth / 2
            : title.alignment === "right" ? this.chartWidth : 0;
        const anchor = title.alignment === "center" ? "middle"
            : title.alignment === "right" ? "end" : "start";

        this.container.append("text")
            .attr("class", "chart-title")
            .attr("x", x)
            .attr("y", title.fontSize)
            .attr("text-anchor", anchor)
            .attr("font-size", `${title.fontSize}px`)
            .attr("font-weight", "bold")
            .attr("fill", title.fontColor)
            .text(title.text);
    }
}
