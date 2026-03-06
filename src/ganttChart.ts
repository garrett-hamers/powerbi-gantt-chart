/**
 * Gantt Chart — D3-based timeline renderer
 */
import * as d3 from "d3";
import { GanttTask, ParsedData } from "./dataParser";
import { getCategoryColor, getContrastTextColor, darkenColor } from "./utils/colors";

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
    legend: {
        show: boolean;
    };
}

export interface GanttDimensions {
    width: number;
    height: number;
    margin: { top: number; right: number; bottom: number; left: number };
}

export class GanttChart {
    private container: d3.Selection<SVGGElement, unknown, null, undefined>;
    private headerContainer: d3.Selection<SVGGElement, unknown, null, undefined> | null;
    private data: ParsedData;
    private settings: GanttSettings;
    private dimensions: GanttDimensions;

    constructor(
        container: d3.Selection<SVGGElement, unknown, null, undefined>,
        data: ParsedData,
        settings: GanttSettings,
        dimensions: GanttDimensions,
        headerContainer?: d3.Selection<SVGGElement, unknown, null, undefined>
    ) {
        this.container = container;
        this.headerContainer = headerContainer || null;
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

        // Legend rendering
        if (this.settings.legend.show && this.data.categories.length > 0) {
            this.renderLegend(chartTop);
            chartTop += 20;
        }

        // Enforce min/max row height so bars are always readable but don't float in empty space
        const minRowHeight = this.settings.barHeight + 6;
        const maxRowHeight = 50;
        const viewportRowHeight = (this.chartHeight - chartTop) / Math.max(1, this.data.tasks.length);
        const clampedRowHeight = Math.max(minRowHeight, Math.min(maxRowHeight, viewportRowHeight));
        const effectiveHeight = this.data.tasks.length * clampedRowHeight;
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

        // Y scale: one lane per task row (using index for uniqueness)
        const rowIds = this.data.tasks.map((_, i) => String(i));
        const yScale = d3.scaleBand()
            .domain(rowIds)
            .range([chartTop, chartTop + effectiveHeight])
            .padding(0.2);

        // Group separator lines between different task names
        for (let i = 1; i < this.data.tasks.length; i++) {
            if (this.data.tasks[i].name !== this.data.tasks[i - 1].name) {
                const y = (yScale(String(i - 1))! + yScale.bandwidth() + yScale(String(i))!) / 2;
                this.container.append("line")
                    .attr("class", "group-separator")
                    .attr("x1", -margin.left + 5)
                    .attr("x2", this.chartWidth)
                    .attr("y1", y)
                    .attr("y2", y)
                    .attr("stroke", "#e0e0e0")
                    .attr("stroke-width", 1);
            }
        }

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

        // X axis — render in header if available, otherwise in main container
        const xAxisTarget = this.headerContainer || this.container;
        if (this.headerContainer) {
            const xAxisTop = d3.axisTop(xScale).ticks(6);
            xAxisTarget.append("g")
                .attr("class", "x-axis")
                .attr("transform", `translate(${margin.left},28)`)
                .call(xAxisTop as any);
        } else {
            const xAxisBottom = d3.axisBottom(xScale).ticks(6);
            xAxisTarget.append("g")
                .attr("class", "x-axis")
                .attr("transform", `translate(0,${chartTop + effectiveHeight})`)
                .call(xAxisBottom as any);
        }

        // Y axis labels — deduplicated, then deoverlapped
        if (this.settings.categories.show) {
            const seenNames = new Set<string>();
            const labelData: Array<{ name: string; y: number }> = [];
            this.data.tasks.forEach((task, i) => {
                if (!seenNames.has(task.name)) {
                    seenNames.add(task.name);
                    const indices = this.data.tasks
                        .map((t, idx) => t.name === task.name ? idx : -1)
                        .filter(idx => idx >= 0);
                    const firstY = yScale(String(indices[0]))! + yScale.bandwidth() / 2;
                    const lastY = yScale(String(indices[indices.length - 1]))! + yScale.bandwidth() / 2;
                    labelData.push({ name: task.name, y: (firstY + lastY) / 2 });
                }
            });

            // Deoverlap: hide labels that would collide
            const minLabelSpacing = this.settings.categories.fontSize + 2;
            const visibleLabels: typeof labelData = [];
            for (const label of labelData) {
                const lastVisible = visibleLabels[visibleLabels.length - 1];
                if (!lastVisible || Math.abs(label.y - lastVisible.y) >= minLabelSpacing) {
                    visibleLabels.push(label);
                }
            }

            this.container.selectAll("text.y-label")
                .data(visibleLabels)
                .enter()
                .append("text")
                .attr("class", "y-label")
                .attr("x", -8)
                .attr("y", d => d.y)
                .attr("dy", "0.35em")
                .attr("text-anchor", "end")
                .attr("font-size", `${this.settings.categories.fontSize}px`)
                .attr("fill", this.settings.categories.fontColor)
                .text(d => d.name);
        }

        // Task bars
        const barHeight = Math.min(this.settings.barHeight, yScale.bandwidth());

        const getBarColor = (d: GanttTask): string => {
            if (d.category && categoryMap.has(d.category)) {
                return getCategoryColor(categoryMap.get(d.category)!, this.settings.categoryColors);
            }
            return getCategoryColor(0, this.settings.categoryColors);
        };

        this.container.selectAll("rect.gantt-bar")
            .data(this.data.tasks)
            .enter()
            .append("rect")
            .attr("class", "gantt-bar")
            .attr("data-dp-index", (d: GanttTask) => String(d.rowIndex))
            .attr("x", (d: GanttTask) => xScale(d.startDate))
            .attr("y", (d: GanttTask, i: number) => {
                const bandY = yScale(String(i)) ?? 0;
                return bandY + (yScale.bandwidth() - barHeight) / 2;
            })
            .attr("width", (d: GanttTask) => Math.max(0, xScale(d.endDate) - xScale(d.startDate)))
            .attr("height", barHeight)
            .attr("rx", this.settings.barCornerRadius)
            .attr("fill", (d: GanttTask) => getBarColor(d))
            .attr("opacity", this.settings.barOpacity / 100);

        // Progress overlay — uses darker shade of the bar's own color
        this.container.selectAll("rect.gantt-progress")
            .data(this.data.tasks.filter(t => t.progress > 0 && t.progress < 100))
            .enter()
            .append("rect")
            .attr("class", "gantt-progress")
            .attr("data-dp-index", (d: GanttTask) => String(d.rowIndex))
            .attr("x", (d: GanttTask) => xScale(d.startDate))
            .attr("y", (d: GanttTask) => {
                const idx = this.data.tasks.indexOf(d);
                const bandY = yScale(String(idx)) ?? 0;
                return bandY + (yScale.bandwidth() - barHeight) / 2;
            })
            .attr("width", (d: GanttTask) => {
                const fullWidth = Math.max(0, xScale(d.endDate) - xScale(d.startDate));
                return fullWidth * (d.progress / 100);
            })
            .attr("height", barHeight)
            .attr("fill", (d: GanttTask) => darkenColor(getBarColor(d), 0.3))
            .attr("opacity", this.settings.barOpacity / 100)
            .attr("pointer-events", "none");

        // Data labels — adaptive text color based on bar luminance
        if (this.settings.dataLabels.show) {
            const defs = this.container.append("defs");
            this.data.tasks.forEach((d, i) => {
                const barWidth = Math.max(0, xScale(d.endDate) - xScale(d.startDate));
                const bandY = yScale(String(i)) ?? 0;
                defs.append("clipPath")
                    .attr("id", `label-clip-${i}`)
                    .append("rect")
                    .attr("x", xScale(d.startDate))
                    .attr("y", bandY)
                    .attr("width", barWidth)
                    .attr("height", yScale.bandwidth());
            });

            this.container.selectAll("text.data-label")
                .data(this.data.tasks)
                .enter()
                .append("text")
                .attr("class", "data-label")
                .attr("clip-path", (d: GanttTask, i: number) => `url(#label-clip-${i})`)
                .attr("x", (d: GanttTask) => xScale(d.startDate) + 4)
                .attr("y", (d: GanttTask, i: number) => {
                    const bandY = yScale(String(i)) ?? 0;
                    return bandY + yScale.bandwidth() / 2;
                })
                .attr("dy", "0.35em")
                .attr("font-size", `${this.settings.dataLabels.fontSize}px`)
                .attr("fill", (d: GanttTask) => getContrastTextColor(getBarColor(d)))
                .text((d: GanttTask) => {
                    const label = d.category || d.name;
                    if (this.settings.dataLabels.showProgress && d.progress > 0) {
                        return `${label} (${Math.round(d.progress)}%)`;
                    }
                    return label;
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

        // Report the required content height for scrolling
        this.requiredHeight = chartTop + effectiveHeight + margin.top + margin.bottom + 30;
    }

    /** The total height needed to render all rows. Used by visual.ts for scrolling. */
    public requiredHeight: number = 0;

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

    private renderLegend(y: number): void {
        const categoryMap = new Map<string, number>();
        this.data.categories.forEach((cat, i) => categoryMap.set(cat, i));

        const legendGroup = this.container.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(0,${y})`);

        let xOffset = 0;
        this.data.categories.forEach((cat, i) => {
            const color = getCategoryColor(i, this.settings.categoryColors);
            legendGroup.append("rect")
                .attr("x", xOffset).attr("y", 0)
                .attr("width", 10).attr("height", 10)
                .attr("rx", 2)
                .attr("fill", color);
            legendGroup.append("text")
                .attr("x", xOffset + 14).attr("y", 9)
                .attr("font-size", "10px")
                .attr("fill", "#666")
                .text(cat);
            xOffset += cat.length * 6 + 28;
        });
    }
}
