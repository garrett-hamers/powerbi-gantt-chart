import { axisBottom, axisTop } from "d3-axis";
import { scaleBand, scaleTime, ScaleBand, ScaleTime } from "d3-scale";
import { Selection } from "d3-selection";
import { GanttTask, ParsedData } from "./dataParser";
import { getCategoryColor, getContrastTextColor } from "./utils/colors";
import { sanitizeInstanceId, truncateText } from "./utils/formatting";

export interface HighContrastSettings {
    isActive: boolean;
    foreground: string;
    background: string;
    foregroundSelected: string;
}

export interface GanttSettings {
    instanceId: string;
    interactionsEnabled: boolean;
    selectionEnabled: boolean;
    showTodayLine: boolean;
    showGridLines: boolean;
    barHeight: number;
    barCornerRadius: number;
    categoryColors: string[];
    progressColor: string;
    todayLineColor: string;
    foregroundColor: string;
    gridColor: string;
    barOpacity: number;
    highContrast: HighContrastSettings;
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
    public requiredHeight = 0;

    private readonly container: Selection<SVGGElement, unknown, null, undefined>;
    private readonly headerContainer: Selection<SVGGElement, unknown, null, undefined> | null;
    private readonly data: ParsedData;
    private readonly settings: GanttSettings;
    private readonly dimensions: GanttDimensions;
    private readonly clipIdPrefix: string;

    constructor(
        container: Selection<SVGGElement, unknown, null, undefined>,
        data: ParsedData,
        settings: GanttSettings,
        dimensions: GanttDimensions,
        headerContainer?: Selection<SVGGElement, unknown, null, undefined>
    ) {
        this.container = container;
        this.headerContainer = headerContainer ?? null;
        this.data = data;
        this.settings = settings;
        this.dimensions = dimensions;
        this.clipIdPrefix = sanitizeInstanceId(settings.instanceId);
    }

    private get chartWidth(): number {
        return Math.max(0, this.dimensions.width - this.dimensions.margin.left - this.dimensions.margin.right);
    }

    private get chartHeight(): number {
        return Math.max(0, this.dimensions.height - this.dimensions.margin.top - this.dimensions.margin.bottom);
    }

    public render(): void {
        this.requiredHeight = 0;
        if (this.chartWidth <= 0 || this.chartHeight <= 0) {
            return;
        }

        const margin = this.dimensions.margin;
        this.container
            .attr("transform", `translate(${margin.left},${margin.top})`)
            .attr("aria-hidden", null);

        let chartTop = 0;
        if (this.settings.title.show && this.settings.title.text) {
            this.renderTitle();
            chartTop += this.settings.title.fontSize + 10;
        }

        if (this.settings.legend.show && this.data.categories.length > 0) {
            this.renderLegend(chartTop);
            chartTop += 20;
        }

        const minimumRowHeight = this.settings.barHeight + 6;
        const maximumRowHeight = 50;
        const viewportRowHeight = Math.max(0, this.chartHeight - chartTop)
            / Math.max(1, this.data.tasks.length);
        const rowHeight = Math.max(minimumRowHeight, Math.min(maximumRowHeight, viewportRowHeight));
        const effectiveHeight = this.data.tasks.length * rowHeight;
        if (effectiveHeight <= 0) {
            return;
        }

        const categoryMap = new Map<string, number>();
        this.data.categories.forEach((category, index) => categoryMap.set(category, index));
        const rowPositionByDataIndex = new Map<number, number>();
        this.data.tasks.forEach((task, index) => rowPositionByDataIndex.set(task.rowIndex, index));

        const timeRange = Math.max(0, this.data.maxDate.getTime() - this.data.minDate.getTime());
        const padding = Math.max(timeRange * 0.05, 86_400_000);
        const paddedMinimum = new Date(this.data.minDate.getTime() - padding);
        const paddedMaximum = new Date(this.data.maxDate.getTime() + padding);
        const xScale = scaleTime()
            .domain([paddedMinimum, paddedMaximum])
            .range([0, this.chartWidth]);
        const rowIds = this.data.tasks.map((_, index) => String(index));
        const yScale = scaleBand()
            .domain(rowIds)
            .range([chartTop, chartTop + effectiveHeight])
            .padding(0.2);

        this.renderGroupSeparators(yScale, effectiveHeight);
        this.renderGridLines(xScale, chartTop, effectiveHeight);
        this.renderXAxis(xScale, chartTop, effectiveHeight);
        this.renderCategoryLabels(yScale);

        const barHeight = Math.min(this.settings.barHeight, yScale.bandwidth());
        const colorForTask = (task: GanttTask): string => {
            const categoryIndex = task.category ? categoryMap.get(task.category) : undefined;
            return getCategoryColor(categoryIndex ?? 0, this.settings.categoryColors);
        };
        const opacityForTask = (task: GanttTask): number => {
            const baseOpacity = this.settings.barOpacity / 100;
            return this.data.hasHighlights && !task.highlighted ? Math.min(baseOpacity, 0.3) : baseOpacity;
        };

        this.renderTaskBars(yScale, xScale, barHeight, rowPositionByDataIndex, colorForTask, opacityForTask);
        this.renderMilestones(yScale, xScale, barHeight, rowPositionByDataIndex, colorForTask, opacityForTask);
        this.decorateDataPoints();
        this.renderProgress(yScale, xScale, barHeight, rowPositionByDataIndex, opacityForTask);
        this.renderDataLabels(yScale, xScale, barHeight, rowPositionByDataIndex, colorForTask);
        this.renderTodayLine(xScale, paddedMinimum, paddedMaximum, chartTop, effectiveHeight);

        const axisSpace = this.headerContainer ? 0 : 24;
        this.requiredHeight = Math.ceil(
            margin.top + chartTop + effectiveHeight + margin.bottom + axisSpace
        );
    }

    private renderGroupSeparators(yScale: ScaleBand<string>, effectiveHeight: number): void {
        if (effectiveHeight <= 0) {
            return;
        }

        const margin = this.dimensions.margin;
        for (let index = 1; index < this.data.tasks.length; index++) {
            const currentTask = this.data.tasks[index];
            const previousTask = this.data.tasks[index - 1];
            const previousY = yScale(String(index - 1));
            const currentY = yScale(String(index));
            if (!currentTask || !previousTask || previousY === undefined || currentY === undefined) {
                continue;
            }

            if (currentTask.name !== previousTask.name) {
                const y = (previousY + yScale.bandwidth() + currentY) / 2;
                this.container.append("line")
                    .attr("class", "group-separator")
                    .attr("x1", -margin.left + 5)
                    .attr("x2", this.chartWidth)
                    .attr("y1", y)
                    .attr("y2", y)
                    .attr("stroke", this.lineColor)
                    .attr("stroke-width", 1)
                    .attr("aria-hidden", "true");
            }
        }
    }

    private renderGridLines(
        xScale: ScaleTime<number, number>,
        chartTop: number,
        effectiveHeight: number
    ): void {
        if (!this.settings.showGridLines) {
            return;
        }

        const ticks = xScale.ticks(this.tickCount);
        this.container.selectAll<SVGLineElement, Date>("line.grid-line")
            .data(ticks)
            .enter()
            .append("line")
            .attr("class", "grid-line")
            .attr("x1", date => xScale(date))
            .attr("x2", date => xScale(date))
            .attr("y1", chartTop)
            .attr("y2", chartTop + effectiveHeight)
            .attr("stroke", this.lineColor)
            .attr("stroke-width", 1)
            .attr("stroke-dasharray", "2,2")
            .attr("aria-hidden", "true");
    }

    private renderXAxis(
        xScale: ScaleTime<number, number>,
        chartTop: number,
        effectiveHeight: number
    ): void {
        const axisTarget = this.headerContainer ?? this.container;
        const axisGroup = axisTarget.append("g")
            .attr("class", "x-axis")
            .attr(
                "transform",
                this.headerContainer
                    ? `translate(${this.dimensions.margin.left},28)`
                    : `translate(0,${chartTop + effectiveHeight})`
            )
            .attr("aria-hidden", "true");

        if (this.headerContainer) {
            axisGroup.call(axisTop(xScale).ticks(this.tickCount));
        } else {
            axisGroup.call(axisBottom(xScale).ticks(this.tickCount));
        }

        axisGroup.selectAll<SVGPathElement | SVGLineElement, unknown>("path, line")
            .attr("stroke", this.foregroundColor);
        axisGroup.selectAll<SVGTextElement, unknown>("text")
            .attr("fill", this.foregroundColor);
    }

    private renderCategoryLabels(yScale: ScaleBand<string>): void {
        if (!this.settings.categories.show) {
            return;
        }

        const ranges = new Map<string, { first: number; last: number }>();
        this.data.tasks.forEach((task, index) => {
            const existing = ranges.get(task.name);
            if (existing) {
                existing.last = index;
            } else {
                ranges.set(task.name, { first: index, last: index });
            }
        });

        const labels: Array<{ name: string; y: number }> = [];
        for (const [name, range] of ranges) {
            const firstY = yScale(String(range.first));
            const lastY = yScale(String(range.last));
            if (firstY === undefined || lastY === undefined) {
                continue;
            }

            labels.push({
                name,
                y: (firstY + lastY + yScale.bandwidth()) / 2
            });
        }

        const minimumSpacing = this.settings.categories.fontSize + 2;
        const approximateCharacterWidth = Math.max(1, this.settings.categories.fontSize * 0.6);
        const maximumLabelCharacters = Math.max(
            2,
            Math.floor((this.dimensions.margin.left - 12) / approximateCharacterWidth)
        );
        const visibleLabels: Array<{ name: string; y: number }> = [];
        for (const label of labels) {
            const previous = visibleLabels[visibleLabels.length - 1];
            if (!previous || Math.abs(label.y - previous.y) >= minimumSpacing) {
                visibleLabels.push(label);
            }
        }

        this.container.selectAll<SVGTextElement, { name: string; y: number }>("text.y-label")
            .data(visibleLabels)
            .enter()
            .append("text")
            .attr("class", "y-label")
            .attr("x", -8)
            .attr("y", label => label.y)
            .attr("dy", "0.35em")
            .attr("text-anchor", "end")
            .attr("font-size", `${this.settings.categories.fontSize}px`)
            .attr("fill", this.settings.highContrast.isActive
                ? this.settings.highContrast.foreground
                : this.settings.categories.fontColor)
            .attr("aria-hidden", "true")
            .text(label => truncateText(label.name, maximumLabelCharacters));
    }

    private renderTaskBars(
        yScale: ScaleBand<string>,
        xScale: ScaleTime<number, number>,
        barHeight: number,
        rowPositionByDataIndex: Map<number, number>,
        colorForTask: (task: GanttTask) => string,
        opacityForTask: (task: GanttTask) => number
    ): void {
        const tasks = this.data.tasks.filter(task => !task.isMilestone);
        this.container.selectAll<SVGRectElement, GanttTask>("rect.gantt-bar")
            .data(tasks)
            .enter()
            .append("rect")
            .attr("class", "gantt-data-point gantt-bar")
            .attr("x", task => xScale(task.startDate))
            .attr("y", task => this.rowTop(task, yScale, rowPositionByDataIndex, barHeight))
            .attr("width", task => Math.max(1, xScale(task.endDate) - xScale(task.startDate)))
            .attr("height", barHeight)
            .attr("rx", this.settings.barCornerRadius)
            .attr("fill", task => this.settings.highContrast.isActive
                ? this.settings.highContrast.background
                : colorForTask(task))
            .attr("stroke", this.settings.highContrast.isActive
                ? this.settings.highContrast.foreground
                : "none")
            .attr("stroke-width", this.settings.highContrast.isActive ? 2 : 0)
            .attr("opacity", opacityForTask);
    }

    private renderMilestones(
        yScale: ScaleBand<string>,
        xScale: ScaleTime<number, number>,
        barHeight: number,
        rowPositionByDataIndex: Map<number, number>,
        colorForTask: (task: GanttTask) => string,
        opacityForTask: (task: GanttTask) => number
    ): void {
        const milestones = this.data.tasks.filter(task => task.isMilestone);
        const markerRadius = Math.max(4, Math.min(10, barHeight / 2));

        this.container.selectAll<SVGPathElement, GanttTask>("path.gantt-milestone")
            .data(milestones)
            .enter()
            .append("path")
            .attr("class", "gantt-data-point gantt-milestone")
            .attr("d", task => {
                const x = xScale(task.startDate);
                const y = this.rowCenter(task, yScale, rowPositionByDataIndex);
                return `M ${x},${y - markerRadius} L ${x + markerRadius},${y} `
                    + `L ${x},${y + markerRadius} L ${x - markerRadius},${y} Z`;
            })
            .attr("fill", task => this.settings.highContrast.isActive
                ? this.settings.highContrast.background
                : colorForTask(task))
            .attr("stroke", task => this.settings.highContrast.isActive
                ? this.settings.highContrast.foreground
                : colorForTask(task))
            .attr("stroke-width", this.settings.highContrast.isActive ? 2 : 1)
            .attr("opacity", opacityForTask);
    }

    private decorateDataPoints(): void {
        const dataPoints = this.container
            .selectAll<SVGGraphicsElement, GanttTask>(".gantt-data-point")
            .sort((left, right) => left.rowIndex - right.rowIndex)
            .attr("data-dp-index", task => String(task.rowIndex))
            .attr("data-highlighted", task => String(task.highlighted))
            .attr("aria-label", task => this.buildAriaLabel(task));

        dataPoints
            .attr("tabindex", this.settings.interactionsEnabled ? 0 : null)
            .attr("role", this.settings.selectionEnabled ? "button" : "img")
            .attr("aria-pressed", this.settings.selectionEnabled ? "false" : null)
            .attr(
                "aria-keyshortcuts",
                this.settings.interactionsEnabled
                    ? this.settings.selectionEnabled ? "Enter Space Shift+F10" : "Shift+F10"
                    : null
            );
    }

    private renderProgress(
        yScale: ScaleBand<string>,
        xScale: ScaleTime<number, number>,
        barHeight: number,
        rowPositionByDataIndex: Map<number, number>,
        opacityForTask: (task: GanttTask) => number
    ): void {
        const tasks = this.data.tasks.filter(
            (task): task is GanttTask & { progress: number } =>
                !task.isMilestone && task.progress !== null && task.progress > 0
        );
        this.container.selectAll<SVGRectElement, GanttTask>("rect.gantt-progress")
            .data(tasks)
            .enter()
            .append("rect")
            .attr("class", "gantt-progress")
            .attr("data-dp-index", task => String(task.rowIndex))
            .attr("data-highlighted", task => String(task.highlighted))
            .attr("x", task => xScale(task.startDate))
            .attr("y", task => this.rowTop(task, yScale, rowPositionByDataIndex, barHeight))
            .attr("width", task => {
                const fullWidth = Math.max(1, xScale(task.endDate) - xScale(task.startDate));
                return fullWidth * (task.progress / 100);
            })
            .attr("height", barHeight)
            .attr("rx", this.settings.barCornerRadius)
            .attr("fill", this.settings.highContrast.isActive
                ? this.settings.highContrast.foreground
                : this.settings.progressColor)
            .attr("opacity", opacityForTask)
            .attr("pointer-events", "none")
            .attr("aria-hidden", "true");
    }

    private renderDataLabels(
        yScale: ScaleBand<string>,
        xScale: ScaleTime<number, number>,
        barHeight: number,
        rowPositionByDataIndex: Map<number, number>,
        colorForTask: (task: GanttTask) => string
    ): void {
        if (!this.settings.dataLabels.show) {
            return;
        }

        const regularTasks = this.data.tasks.filter(task => !task.isMilestone);
        const definitions = this.container.append("defs").attr("aria-hidden", "true");
        const clips = definitions.selectAll<SVGClipPathElement, GanttTask>("clipPath")
            .data(regularTasks)
            .enter()
            .append("clipPath")
            .attr("id", task => this.clipId(task));

        clips.append("rect")
            .attr("x", task => xScale(task.startDate))
            .attr("y", task => this.rowTop(task, yScale, rowPositionByDataIndex, barHeight))
            .attr("width", task => Math.max(1, xScale(task.endDate) - xScale(task.startDate)))
            .attr("height", barHeight);

        this.container.selectAll<SVGTextElement, GanttTask>("text.data-label")
            .data(this.data.tasks)
            .enter()
            .append("text")
            .attr("class", "data-label")
            .attr("clip-path", task => task.isMilestone ? null : `url(#${this.clipId(task)})`)
            .attr("x", task => xScale(task.startDate) + (task.isMilestone ? barHeight / 2 + 4 : 4))
            .attr("y", task => this.rowCenter(task, yScale, rowPositionByDataIndex))
            .attr("dy", "0.35em")
            .attr("font-size", `${this.settings.dataLabels.fontSize}px`)
            .attr("fill", task => this.getDataLabelColor(task, colorForTask))
            .attr("stroke", task => this.getDataLabelOutlineColor(task, colorForTask))
            .attr("stroke-width", 1.5)
            .attr("stroke-linejoin", "round")
            .style("paint-order", "stroke")
            .attr("aria-hidden", "true")
            .text(task => {
                const label = task.category || task.name;
                return this.settings.dataLabels.showProgress && task.progressLabel !== null
                    ? `${label} (${task.progressLabel})`
                    : label;
            });
    }

    private getDataLabelColor(
        task: GanttTask,
        colorForTask: (task: GanttTask) => string
    ): string {
        const hasProgressOverlay = task.progress !== null && task.progress > 0 && !task.isMilestone;
        if (this.settings.highContrast.isActive) {
            return hasProgressOverlay
                ? this.settings.highContrast.background
                : this.settings.highContrast.foreground;
        }

        if (task.isMilestone) {
            return this.foregroundColor;
        }

        const visibleFill = hasProgressOverlay
            ? this.settings.progressColor
            : colorForTask(task);
        return getContrastTextColor(visibleFill);
    }

    private getDataLabelOutlineColor(
        task: GanttTask,
        colorForTask: (task: GanttTask) => string
    ): string {
        const hasProgressOverlay = task.progress !== null && task.progress > 0 && !task.isMilestone;
        if (this.settings.highContrast.isActive) {
            return hasProgressOverlay
                ? this.settings.highContrast.foreground
                : this.settings.highContrast.background;
        }

        const textColor = this.getDataLabelColor(task, colorForTask);
        return textColor === "#ffffff" ? "#000000" : "#ffffff";
    }

    private renderTodayLine(
        xScale: ScaleTime<number, number>,
        paddedMinimum: Date,
        paddedMaximum: Date,
        chartTop: number,
        effectiveHeight: number
    ): void {
        if (!this.settings.showTodayLine) {
            return;
        }

        const today = new Date();
        if (today < paddedMinimum || today > paddedMaximum) {
            return;
        }

        this.container.append("line")
            .attr("class", "today-line")
            .attr("x1", xScale(today))
            .attr("x2", xScale(today))
            .attr("y1", chartTop)
            .attr("y2", chartTop + effectiveHeight)
            .attr("stroke", this.settings.highContrast.isActive
                ? this.settings.highContrast.foregroundSelected
                : this.settings.todayLineColor)
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "6,3")
            .attr("aria-hidden", "true");
    }

    private renderTitle(): void {
        const { title } = this.settings;
        const x = title.alignment === "center"
            ? this.chartWidth / 2
            : title.alignment === "right" ? this.chartWidth : 0;
        const anchor = title.alignment === "center"
            ? "middle"
            : title.alignment === "right" ? "end" : "start";

        this.container.append("text")
            .attr("class", "chart-title")
            .attr("x", x)
            .attr("y", title.fontSize)
            .attr("text-anchor", anchor)
            .attr("font-size", `${title.fontSize}px`)
            .attr("font-weight", "bold")
            .attr("fill", this.settings.highContrast.isActive
                ? this.settings.highContrast.foreground
                : title.fontColor)
            .attr("aria-hidden", "true")
            .text(title.text);
    }

    private renderLegend(y: number): void {
        const legendGroup = this.container.append("g")
            .attr("class", "legend")
            .attr("transform", `translate(0,${y})`)
            .attr("aria-hidden", "true");

        let xOffset = 0;
        for (let index = 0; index < this.data.categories.length; index++) {
            const category = this.data.categories[index];
            if (!category) {
                continue;
            }

            const displayCategory = truncateText(category, 30);
            const itemWidth = displayCategory.length * 6 + 28;
            if (xOffset + itemWidth > this.chartWidth) {
                if (xOffset + 12 <= this.chartWidth) {
                    legendGroup.append("text")
                        .attr("x", xOffset)
                        .attr("y", 9)
                        .attr("font-size", "10px")
                        .attr("fill", this.foregroundColor)
                        .text("\u2026");
                }
                break;
            }

            const color = getCategoryColor(index, this.settings.categoryColors);
            legendGroup.append("rect")
                .attr("x", xOffset)
                .attr("y", 0)
                .attr("width", 10)
                .attr("height", 10)
                .attr("rx", 2)
                .attr("fill", this.settings.highContrast.isActive
                    ? this.settings.highContrast.background
                    : color)
                .attr("stroke", this.settings.highContrast.isActive
                    ? this.settings.highContrast.foreground
                    : "none")
                .attr("stroke-width", this.settings.highContrast.isActive ? 2 : 0);
            legendGroup.append("text")
                .attr("x", xOffset + 14)
                .attr("y", 9)
                .attr("font-size", "10px")
                .attr("fill", this.foregroundColor)
                .text(displayCategory);
            xOffset += itemWidth;
        }
    }

    private rowTop(
        task: GanttTask,
        yScale: ScaleBand<string>,
        rowPositionByDataIndex: Map<number, number>,
        barHeight: number
    ): number {
        const rowPosition = rowPositionByDataIndex.get(task.rowIndex);
        const bandY = rowPosition === undefined ? undefined : yScale(String(rowPosition));
        return (bandY ?? 0) + (yScale.bandwidth() - barHeight) / 2;
    }

    private rowCenter(
        task: GanttTask,
        yScale: ScaleBand<string>,
        rowPositionByDataIndex: Map<number, number>
    ): number {
        const rowPosition = rowPositionByDataIndex.get(task.rowIndex);
        const bandY = rowPosition === undefined ? undefined : yScale(String(rowPosition));
        return (bandY ?? 0) + yScale.bandwidth() / 2;
    }

    private clipId(task: GanttTask): string {
        return `${this.clipIdPrefix}-label-${task.rowIndex}`;
    }

    private buildAriaLabel(task: GanttTask): string {
        const dateDescription = task.isMilestone
            ? `milestone on ${task.startDateLabel}`
            : `${task.startDateLabel} to ${task.endDateLabel}, ${task.durationLabel}`;
        const progressDescription = task.progressLabel === null
            ? ""
            : `, progress ${task.progressLabel}`;
        const categoryDescription = task.category ? `, category ${task.category}` : "";
        return `${task.name}, ${dateDescription}${progressDescription}${categoryDescription}`;
    }

    private get tickCount(): number {
        return Math.max(2, Math.min(8, Math.floor(this.chartWidth / 100)));
    }

    private get foregroundColor(): string {
        return this.settings.highContrast.isActive
            ? this.settings.highContrast.foreground
            : this.settings.foregroundColor;
    }

    private get lineColor(): string {
        return this.settings.highContrast.isActive
            ? this.settings.highContrast.foreground
            : this.settings.gridColor;
    }
}
