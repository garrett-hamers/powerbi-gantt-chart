"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { BasicFilter, IBasicFilter, IFilterColumnTarget } from "powerbi-models";
import { select, Selection } from "d3-selection";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import HostSelectionId = powerbi.extensibility.ISelectionId;
import SelectionId = powerbi.visuals.ISelectionId;
import ITooltipService = powerbi.extensibility.ITooltipService;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import DataView = powerbi.DataView;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

import { VisualFormattingSettingsModel } from "./settings";
import { GanttTask, ParsedData, TaskFilterValue, parseDataView } from "./dataParser";
import { GanttChart, GanttDimensions, GanttSettings } from "./ganttChart";
import { clampNumber, truncateText } from "./utils/formatting";

type CrossFilterMode = "highlight" | "filter";

const EMPTY_SELECTION_ID: HostSelectionId = {};
const EMPTY_FILTER = null as unknown as powerbi.IFilter;
const MERGE_FILTER_ACTION: powerbi.FilterAction.merge = 0;
const REMOVE_FILTER_ACTION: powerbi.FilterAction.remove = 1;

export class Visual implements IVisual {
    private readonly target: HTMLElement;
    private readonly headerSvg: Selection<SVGSVGElement, unknown, null, undefined>;
    private readonly headerContainer: Selection<SVGGElement, unknown, null, undefined>;
    private readonly scrollBody: HTMLDivElement;
    private readonly svg: Selection<SVGSVGElement, unknown, null, undefined>;
    private readonly chartContainer: Selection<SVGGElement, unknown, null, undefined>;
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly host: IVisualHost;
    private readonly selectionManager: ISelectionManager;
    private readonly tooltipService: ITooltipService;
    private readonly events: IVisualEventService;

    private formattingSettings = new VisualFormattingSettingsModel();
    private dataView: DataView | undefined;
    private parsedData: ParsedData | null = null;
    private currentSettings: GanttSettings | null = null;
    private selectionIds = new Map<number, SelectionId>();
    private crossFilterValues = new Map<string, TaskFilterValue>();
    private taskFilterTarget: IFilterColumnTarget | null = null;
    private crossFilterMode: CrossFilterMode = "highlight";

    constructor(options?: VisualConstructorOptions) {
        if (!options) {
            throw new Error("Visual constructor options are required");
        }

        this.target = options.element;
        this.host = options.host;
        this.events = this.host.eventService;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipService = this.host.tooltipService;
        this.formattingSettingsService = new FormattingSettingsService();

        this.target.classList.add("gantt-root");
        this.target.setAttribute("role", "region");
        this.target.setAttribute("aria-label", "Atlyn Gantt Chart");
        this.target.style.overflow = "hidden";
        this.target.style.display = "flex";
        this.target.style.flexDirection = "column";

        this.headerSvg = select(this.target)
            .append("svg")
            .classed("ganttChart ganttHeader", true)
            .style("flex-shrink", "0")
            .attr("aria-hidden", "true");
        this.headerContainer = this.headerSvg.append("g")
            .classed("headerContainer", true);

        this.scrollBody = document.createElement("div");
        this.scrollBody.className = "gantt-scroll-body";
        this.scrollBody.style.flex = "1";
        this.scrollBody.style.overflowY = "hidden";
        this.scrollBody.style.overflowX = "hidden";
        this.target.appendChild(this.scrollBody);

        this.svg = select(this.scrollBody)
            .append("svg")
            .classed("ganttChart ganttBody", true)
            .attr("role", "group");
        this.chartContainer = this.svg.append("g")
            .classed("chartContainer", true);

        this.headerSvg.on("contextmenu.gantt", event => this.showBackgroundContextMenu(event));
        this.svg.on("contextmenu.gantt", event => this.showBackgroundContextMenu(event));
        this.selectionManager.registerOnSelectCallback(selectionIds => {
            this.syncSelectionState(selectionIds);
        });
    }

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);

        try {
            this.render(options);
            this.events.renderingFinished(options);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.events.renderingFailed(options, message);
            throw error;
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        this.headerSvg.on(".gantt", null);
        this.svg.on(".gantt", null);
        this.chartContainer.selectAll<SVGElement, unknown>("*").on(".gantt", null);
        this.tooltipService.hide({ immediately: true, isTouchEvent: false });
    }

    private render(options: VisualUpdateOptions): void {
        const width = normalizeViewportDimension(options.viewport.width);
        const height = normalizeViewportDimension(options.viewport.height);
        const headerHeight = Math.min(30, height);
        const bodyHeight = Math.max(0, height - headerHeight);

        this.chartContainer.selectAll("*").remove();
        this.chartContainer.attr("transform", null).classed("landing", false);
        this.headerContainer.selectAll("*").remove();
        this.selectionIds.clear();
        this.parsedData = null;
        this.currentSettings = null;
        this.svg
            .on("click.gantt-clear", null)
            .on("keydown.gantt-clear", null)
            .attr("tabindex", null)
            .attr("aria-keyshortcuts", null);

        this.headerSvg.attr("width", width).attr("height", headerHeight);
        this.svg.attr("width", width).attr("height", bodyHeight);

        this.dataView = options.dataViews?.[0];
        if (!this.dataView) {
            this.formattingSettings = new VisualFormattingSettingsModel();
            if (options.jsonFilters !== undefined) {
                this.hydrateCrossFilterValues(options.jsonFilters);
            }
            this.headerSvg.attr("height", 0);
            this.svg.attr("height", height);
            this.renderLandingPage(width, height);
            return;
        }

        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel,
            this.dataView
        );
        this.crossFilterMode = this.getCrossFilterMode();
        const taskSource = findTaskSource(this.dataView);
        if (taskSource) {
            this.taskFilterTarget = getFilterTarget(taskSource);
        }
        if (options.jsonFilters !== undefined) {
            this.hydrateCrossFilterValues(options.jsonFilters);
        }
        this.parsedData = parseDataView(this.dataView, this.host.locale || "en-US");
        if (!this.parsedData?.tasks.length) {
            this.headerSvg.attr("height", 0);
            this.svg.attr("height", height);
            this.renderLandingPage(width, height);
            return;
        }

        this.createSelectionIds();
        this.currentSettings = this.buildSettings(this.parsedData);

        const longestName = this.parsedData.tasks.reduce(
            (longest, task) => task.name.length > longest.length ? task.name : longest,
            ""
        );
        const categoryFontSize = this.currentSettings.categories.fontSize;
        const estimatedLabelWidth = Math.min(
            longestName.length * categoryFontSize * 0.6 + 16,
            width * 0.45
        );
        const maximumLeftMargin = Math.max(0, width - 40);
        const leftMargin = Math.min(maximumLeftMargin, Math.max(60, estimatedLabelWidth));
        const rightMargin = Math.min(30, Math.max(0, width - leftMargin - 10));
        const dimensions: GanttDimensions = {
            width,
            height: bodyHeight,
            margin: { top: 10, right: rightMargin, bottom: 0, left: leftMargin }
        };

        const chart = new GanttChart(
            this.chartContainer,
            this.parsedData,
            this.currentSettings,
            dimensions,
            this.headerContainer
        );
        chart.render();

        const renderedHeight = Math.max(bodyHeight, chart.requiredHeight);
        this.svg.attr("height", renderedHeight);
        this.scrollBody.style.overflowY = chart.requiredHeight > bodyHeight ? "auto" : "hidden";
        this.svg
            .attr("role", "group")
            .attr(
                "aria-label",
                `Gantt chart with ${this.parsedData.tasks.length} `
                    + `${this.parsedData.tasks.length === 1 ? "task" : "tasks"}`
            );

        this.addInteractivity();
        if (this.crossFilterMode === "filter" && this.crossFilterValues.size > 0) {
            this.syncFilterState();
        } else {
            this.syncSelectionState(this.selectionManager.getSelectionIds());
        }
    }

    private buildSettings(data: ParsedData): GanttSettings {
        const palette = this.host.colorPalette;
        const design = this.formattingSettings.designCard;
        const configuredCategoryColors = [
            design.categoryColor1.value.value,
            design.categoryColor2.value.value,
            design.categoryColor3.value.value,
            design.categoryColor4.value.value,
            design.categoryColor5.value.value,
            design.categoryColor6.value.value,
            design.categoryColor7.value.value,
            design.categoryColor8.value.value,
            design.categoryColor9.value.value,
            design.categoryColor10.value.value
        ];
        const categoryKeys = data.categories.length > 0 ? data.categories : ["Tasks"];
        const categoryColors = categoryKeys.map((category, index) => {
            const configuredIndex = index % configuredCategoryColors.length;
            const configuredColor = configuredCategoryColors[configuredIndex] || "#2196F3";
            const propertyName = `categoryColor${configuredIndex + 1}`;
            if (index < configuredCategoryColors.length && this.hasFormattingProperty("design", propertyName)) {
                return configuredColor;
            }

            return palette.getColor(category).value || configuredColor;
        });
        const titleAlignment = String(this.formattingSettings.titleCard.alignment.value.value);
        const foregroundColor = palette.foreground?.value || "#333333";
        const backgroundColor = palette.background?.value || "#ffffff";
        const interactionsEnabled = this.host.hostCapabilities?.allowInteractions !== false;

        return {
            instanceId: this.host.instanceId || "visual",
            interactionsEnabled,
            selectionEnabled: interactionsEnabled
                && this.formattingSettings.interactionCard.enableSelection.value,
            showTodayLine: this.formattingSettings.chartSettingsCard.showTodayLine.value,
            showGridLines: this.formattingSettings.chartSettingsCard.showGridLines.value,
            barHeight: clampNumber(
                this.formattingSettings.chartSettingsCard.barHeight.value,
                4,
                100,
                24
            ),
            barCornerRadius: clampNumber(
                this.formattingSettings.chartSettingsCard.barCornerRadius.value,
                0,
                50,
                4
            ),
            categoryColors,
            progressColor: design.progressColor.value.value || "#1565C0",
            todayLineColor: design.todayLineColor.value.value || "#E53935",
            foregroundColor,
            gridColor: palette.foregroundNeutralLight?.value || "#e0e0e0",
            barOpacity: clampNumber(design.barOpacity.value, 0, 100, 80),
            highContrast: {
                isActive: palette.isHighContrast,
                foreground: foregroundColor,
                background: backgroundColor,
                foregroundSelected: palette.foregroundSelected?.value || foregroundColor
            },
            title: {
                show: this.formattingSettings.titleCard.show.value,
                text: truncateText(this.formattingSettings.titleCard.titleText.value),
                fontSize: clampNumber(this.formattingSettings.titleCard.fontSize.value, 8, 72, 16),
                fontColor: this.formattingSettings.titleCard.fontColor.value.value || foregroundColor,
                alignment: isTitleAlignment(titleAlignment) ? titleAlignment : "left"
            },
            dataLabels: {
                show: this.formattingSettings.dataLabelsCard.show.value,
                fontSize: clampNumber(this.formattingSettings.dataLabelsCard.fontSize.value, 8, 40, 11),
                showProgress: this.formattingSettings.dataLabelsCard.showProgress.value
            },
            categories: {
                show: this.formattingSettings.categoriesCard.show.value,
                fontSize: clampNumber(this.formattingSettings.categoriesCard.fontSize.value, 8, 40, 11),
                fontColor: this.formattingSettings.categoriesCard.fontColor.value.value || foregroundColor
            },
            legend: {
                show: this.formattingSettings.legendCard.show.value
            }
        };
    }

    private hasFormattingProperty(objectName: string, propertyName: string): boolean {
        const object = this.dataView?.metadata?.objects?.[objectName];
        return object !== undefined
            && object !== null
            && Object.prototype.hasOwnProperty.call(object, propertyName);
    }

    private createSelectionIds(): void {
        const taskColumn = this.dataView?.categorical?.categories?.find(
            category => category.source.roles?.task
        );
        if (!taskColumn) {
            return;
        }

        for (let rowIndex = 0; rowIndex < taskColumn.values.length; rowIndex++) {
            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(taskColumn, rowIndex)
                .createSelectionId();
            this.selectionIds.set(rowIndex, selectionId);
        }
    }

    private addInteractivity(): void {
        if (!this.currentSettings) {
            return;
        }

        const interaction = this.formattingSettings.interactionCard;
        const interactionsAllowed = this.host.hostCapabilities?.allowInteractions !== false;
        const dataPoints = this.chartContainer
            .selectAll<SVGGraphicsElement, GanttTask>(".gantt-data-point");

        dataPoints
            .classed("is-selectable", interactionsAllowed && interaction.enableSelection.value);

        if (interactionsAllowed) {
            dataPoints
                .on("contextmenu.gantt", (event: MouseEvent, task: GanttTask) => {
                    event.preventDefault();
                    event.stopPropagation();
                    this.showDataPointContextMenu(task, {
                        x: event.clientX,
                        y: event.clientY
                    });
                })
                .on("keydown.gantt", (event: KeyboardEvent, task: GanttTask) => {
                    this.handleDataPointKeydown(event, task);
                });
        }

        if (interactionsAllowed && interaction.enableSelection.value) {
            dataPoints.on("click.gantt", (event: MouseEvent, task: GanttTask) => {
                event.preventDefault();
                event.stopPropagation();
                this.selectTask(task, event.ctrlKey || event.metaKey);
            });

            this.svg.on("click.gantt-clear", (event: MouseEvent) => {
                const target = event.target;
                if (target instanceof Element && target.closest(".gantt-data-point")) {
                    return;
                }

                this.clearSelections();
            });
        }

        if (interactionsAllowed && interaction.enableTooltips.value && this.tooltipService.enabled()) {
            dataPoints
                .on("mouseover.gantt", (event: MouseEvent, task: GanttTask) => {
                    this.showTaskTooltip(task, [event.clientX, event.clientY]);
                })
                .on("mousemove.gantt", (event: MouseEvent, task: GanttTask) => {
                    this.moveTaskTooltip(task, [event.clientX, event.clientY]);
                })
                .on("mouseout.gantt", () => {
                    this.hideTaskTooltip();
                })
                .on("focus.gantt", (event: FocusEvent, task: GanttTask) => {
                    const element = event.currentTarget as SVGGraphicsElement;
                    const bounds = element.getBoundingClientRect();
                    this.showTaskTooltip(task, [
                        bounds.left + bounds.width / 2,
                        bounds.top + bounds.height / 2
                    ]);
                })
                .on("blur.gantt", () => {
                    this.hideTaskTooltip();
                });
        }
    }

    private handleDataPointKeydown(event: KeyboardEvent, task: GanttTask): void {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            const element = event.currentTarget as SVGGraphicsElement;
            const bounds = element.getBoundingClientRect();
            this.showDataPointContextMenu(task, {
                x: bounds.left + bounds.width / 2,
                y: bounds.top + bounds.height / 2
            });
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            this.clearSelections();
            return;
        }

        if (
            this.formattingSettings.interactionCard.enableSelection.value
            && (event.key === "Enter" || event.key === " ")
        ) {
            event.preventDefault();
            this.selectTask(task, event.ctrlKey || event.metaKey);
            return;
        }

        const direction = event.key === "ArrowRight" || event.key === "ArrowDown"
            ? 1
            : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        if (direction !== 0 || event.key === "Home" || event.key === "End") {
            event.preventDefault();
            this.moveDataPointFocus(
                event.currentTarget as SVGGraphicsElement,
                direction,
                event.key === "Home",
                event.key === "End"
            );
        }
    }

    private moveDataPointFocus(
        current: SVGGraphicsElement,
        direction: number,
        moveToStart: boolean,
        moveToEnd: boolean
    ): void {
        const dataPoints = Array.from(
            this.target.querySelectorAll<SVGGraphicsElement>(".gantt-data-point")
        );
        const currentIndex = dataPoints.indexOf(current);
        if (currentIndex < 0 || dataPoints.length === 0) {
            return;
        }

        const targetIndex = moveToStart
            ? 0
            : moveToEnd
                ? dataPoints.length - 1
                : (currentIndex + direction + dataPoints.length) % dataPoints.length;
        dataPoints[targetIndex]?.focus();
    }

    private selectTask(task: GanttTask, multiSelect: boolean): void {
        if (this.crossFilterMode === "filter" && this.taskFilterTarget) {
            this.applyTaskFilter(task, multiSelect);
            return;
        }

        if (this.crossFilterValues.size > 0) {
            this.clearCrossFilter();
        }

        const selectionId = this.selectionIds.get(task.rowIndex);
        if (!selectionId) {
            return;
        }

        void this.selectionManager.select(selectionId, multiSelect)
            .then(selectionIds => this.syncSelectionState(selectionIds));
    }

    private applyTaskFilter(task: GanttTask, multiSelect: boolean): void {
        if (!this.taskFilterTarget) {
            return;
        }

        const key = getFilterValueKey(task.filterValue);
        if (!multiSelect) {
            this.crossFilterValues.clear();
            this.crossFilterValues.set(key, task.filterValue);
        } else if (this.crossFilterValues.has(key)) {
            this.crossFilterValues.delete(key);
        } else {
            this.crossFilterValues.set(key, task.filterValue);
        }

        void this.selectionManager.clear();
        if (this.crossFilterValues.size === 0) {
            this.host.applyJsonFilter(
                EMPTY_FILTER,
                "general",
                "filter",
                REMOVE_FILTER_ACTION
            );
            this.syncFilterState();
            return;
        }

        const filter = new BasicFilter(
            this.taskFilterTarget,
            "In",
            Array.from(this.crossFilterValues.values())
        );
        this.host.applyJsonFilter(
            filter.toJSON(),
            "general",
            "filter",
            MERGE_FILTER_ACTION
        );
        this.syncFilterState();
    }

    private hydrateCrossFilterValues(filters: powerbi.IFilter[]): void {
        this.crossFilterValues.clear();
        const filterTarget = this.taskFilterTarget;
        if (!filterTarget) {
            return;
        }

        const matchingFilter = filters
            .map(asBasicFilter)
            .find(filter => filter !== null
                && isSameFilterTarget(filter.target, filterTarget));
        if (!matchingFilter) {
            return;
        }

        for (const value of matchingFilter.values) {
            this.crossFilterValues.set(getFilterValueKey(value), value);
        }
    }

    private clearSelections(): void {
        void this.selectionManager.clear()
            .then(() => this.syncSelectionState([]));
        this.clearCrossFilter();
    }

    private clearCrossFilter(): void {
        if (!this.taskFilterTarget) {
            return;
        }

        this.crossFilterValues.clear();
        this.host.applyJsonFilter(
            EMPTY_FILTER,
            "general",
            "filter",
            REMOVE_FILTER_ACTION
        );
    }

    private syncFilterState(): void {
        const selectedRows = new Set<number>();
        for (const task of this.parsedData?.tasks ?? []) {
            if (this.crossFilterValues.has(getFilterValueKey(task.filterValue))) {
                selectedRows.add(task.rowIndex);
            }
        }

        this.applyDataPointState(selectedRows.size > 0 ? selectedRows : null);
    }

    private syncSelectionState(selectionIds: HostSelectionId[]): void {
        const visualSelectionIds = selectionIds.filter(isVisualSelectionId);
        const selectedRows = new Set<number>();

        for (const [rowIndex, rowSelectionId] of this.selectionIds) {
            if (visualSelectionIds.some(selectionId =>
                rowSelectionId.equals(selectionId)
                || rowSelectionId.getKey() === selectionId.getKey()
            )) {
                selectedRows.add(rowIndex);
            }
        }

        this.applyDataPointState(selectedRows.size > 0 ? selectedRows : null);
    }

    private applyDataPointState(selectedRows: Set<number> | null): void {
        if (!this.currentSettings) {
            return;
        }

        const baseOpacity = this.currentSettings.barOpacity / 100;
        const opacityForTask = (task: GanttTask): number => {
            if (selectedRows) {
                return selectedRows.has(task.rowIndex) ? baseOpacity : Math.min(baseOpacity, 0.3);
            }

            return this.parsedData?.hasHighlights && !task.highlighted
                ? Math.min(baseOpacity, 0.3)
                : baseOpacity;
        };

        this.chartContainer.selectAll<SVGGraphicsElement, GanttTask>(".gantt-data-point")
            .attr("opacity", opacityForTask)
            .attr(
                "aria-pressed",
                task => this.currentSettings?.selectionEnabled
                    ? String(selectedRows?.has(task.rowIndex) ?? false)
                    : null
            );
        this.chartContainer.selectAll<SVGRectElement, GanttTask>(".gantt-progress")
            .attr("opacity", opacityForTask);

        if (this.currentSettings.highContrast.isActive) {
            const highContrast = this.currentSettings.highContrast;
            this.chartContainer.selectAll<SVGGraphicsElement, GanttTask>(".gantt-data-point")
                .attr("stroke", task => selectedRows?.has(task.rowIndex)
                    ? highContrast.foregroundSelected
                    : highContrast.foreground);
        }
    }

    private showTaskTooltip(task: GanttTask, coordinates: [number, number]): void {
        const selectionId = this.selectionIds.get(task.rowIndex);
        this.tooltipService.show({
            dataItems: this.buildTaskTooltip(task),
            identities: selectionId ? [selectionId] : [],
            coordinates,
            isTouchEvent: false
        });
    }

    private moveTaskTooltip(task: GanttTask, coordinates: [number, number]): void {
        const selectionId = this.selectionIds.get(task.rowIndex);
        this.tooltipService.move({
            dataItems: this.buildTaskTooltip(task),
            identities: selectionId ? [selectionId] : [],
            coordinates,
            isTouchEvent: false
        });
    }

    private hideTaskTooltip(): void {
        this.tooltipService.hide({ immediately: true, isTouchEvent: false });
    }

    private buildTaskTooltip(task: GanttTask): VisualTooltipDataItem[] {
        const items: VisualTooltipDataItem[] = [
            { displayName: "Task", value: task.name }
        ];

        if (task.isMilestone) {
            items.push(
                { displayName: "Date", value: task.startDateLabel },
                { displayName: "Duration", value: task.durationLabel }
            );
        } else {
            items.push(
                { displayName: "Start", value: task.startDateLabel },
                { displayName: "End", value: task.endDateLabel },
                { displayName: "Duration", value: task.durationLabel }
            );
        }

        items.push({ displayName: "Progress", value: task.progressLabel });
        if (task.category) {
            items.push({ displayName: "Category", value: task.category });
        }
        items.push(...task.tooltipFields);
        return items;
    }

    private showBackgroundContextMenu(event: MouseEvent): void {
        if (this.host.hostCapabilities?.allowInteractions === false) {
            return;
        }

        const target = event.target;
        if (target instanceof Element && target.closest(".gantt-data-point")) {
            return;
        }

        event.preventDefault();
        void this.selectionManager.showContextMenu(
            EMPTY_SELECTION_ID,
            { x: event.clientX, y: event.clientY }
        );
    }

    private showDataPointContextMenu(
        task: GanttTask,
        position: { x: number; y: number }
    ): void {
        const selectionId = this.selectionIds.get(task.rowIndex) ?? EMPTY_SELECTION_ID;
        void this.selectionManager.showContextMenu(selectionId, position, "task");
    }

    private getCrossFilterMode(): CrossFilterMode {
        const value = String(this.formattingSettings.interactionCard.crossFilterMode.value.value);
        return value === "filter" ? "filter" : "highlight";
    }

    private renderLandingPage(width: number, height: number): void {
        const palette = this.host.colorPalette;
        const foreground = palette.foregroundNeutralSecondary?.value
            || palette.foreground?.value
            || "#666666";
        const background = palette.background?.value || "#ffffff";
        const centerX = width / 2;
        const centerY = height / 2;

        this.scrollBody.style.overflowY = "hidden";
        this.chartContainer.classed("landing", true);
        const canClearFilter = this.host.hostCapabilities?.allowInteractions !== false
            && this.taskFilterTarget !== null
            && this.crossFilterValues.size > 0;
        this.svg
            .attr("role", canClearFilter ? "button" : "img")
            .attr("tabindex", canClearFilter ? 0 : null)
            .attr("aria-keyshortcuts", canClearFilter ? "Enter Space Escape" : null)
            .attr(
                "aria-label",
                canClearFilter
                    ? "Atlyn Gantt Chart has no matching tasks. Activate to clear the task filter."
                    : "Atlyn Gantt Chart. Add Task, Start Date, and End Date fields."
            );
        if (canClearFilter) {
            this.svg
                .on("click.gantt-clear", () => this.clearSelections())
                .on("keydown.gantt-clear", (event: KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " " || event.key === "Escape") {
                        event.preventDefault();
                        this.clearSelections();
                    }
                });
        }
        this.chartContainer.append("rect")
            .attr("width", width)
            .attr("height", height)
            .attr("fill", background)
            .attr("aria-hidden", "true");
        this.chartContainer.append("text")
            .attr("x", centerX)
            .attr("y", Math.max(14, centerY - 10))
            .attr("text-anchor", "middle")
            .attr("fill", foreground)
            .attr("font-size", "14px")
            .attr("font-weight", "bold")
            .attr("aria-hidden", "true")
            .text("Atlyn Gantt Chart");
        this.chartContainer.append("text")
            .attr("x", centerX)
            .attr("y", Math.max(28, centerY + 14))
            .attr("text-anchor", "middle")
            .attr("fill", foreground)
            .attr("font-size", "11px")
            .attr("aria-hidden", "true")
            .text("Add Task, Start Date, and End Date fields");
    }
}

function normalizeViewportDimension(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function isTitleAlignment(value: string): value is GanttSettings["title"]["alignment"] {
    return value === "left" || value === "center" || value === "right";
}

function isVisualSelectionId(selectionId: HostSelectionId): selectionId is SelectionId {
    const candidate = selectionId as Partial<SelectionId>;
    return typeof candidate.equals === "function"
        && typeof candidate.getKey === "function";
}

function getFilterValueKey(value: TaskFilterValue): string {
    return `${typeof value}:${String(value)}`;
}

function asBasicFilter(filter: powerbi.IFilter): IBasicFilter | null {
    const candidate = filter as Partial<IBasicFilter>;
    const target = candidate.target as Partial<IFilterColumnTarget> | undefined;
    if (
        !Array.isArray(candidate.values)
        || typeof target?.table !== "string"
        || typeof target.column !== "string"
    ) {
        return null;
    }

    return candidate as IBasicFilter;
}

function isSameFilterTarget(
    target: IBasicFilter["target"],
    expected: IFilterColumnTarget
): boolean {
    const columnTarget = target as Partial<IFilterColumnTarget>;
    return columnTarget.table === expected.table
        && columnTarget.column === expected.column;
}

function findTaskSource(dataView: DataView): powerbi.DataViewMetadataColumn | undefined {
    return dataView.categorical?.categories?.find(
        category => category.source.roles?.task
    )?.source;
}

interface SQExpressionShape {
    source?: { entity?: unknown };
    arg?: SQExpressionShape;
    entity?: unknown;
    property?: unknown;
    ref?: unknown;
    level?: unknown;
}

function getFilterTarget(source: powerbi.DataViewMetadataColumn): IFilterColumnTarget | null {
    const expression = source.expr as SQExpressionShape | undefined;
    if (expression) {
        const hierarchyReference = expression.arg?.arg;
        const table = readNonEmptyString(hierarchyReference?.entity)
            ?? readNonEmptyString(expression.source?.entity);
        const column = readNonEmptyString(hierarchyReference?.property)
            ?? readNonEmptyString(expression.ref)
            ?? readNonEmptyString(expression.level);
        if (table && column) {
            return { table, column };
        }
    }

    return parseFilterTarget(source.queryName);
}

function readNonEmptyString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseFilterTarget(queryName: string | undefined): IFilterColumnTarget | null {
    if (!queryName) {
        return null;
    }

    const bracketed = /^(?:'([^']+)'|([^\[]+))\[([^\]]+)\]$/.exec(queryName);
    if (bracketed) {
        const table = (bracketed[1] || bracketed[2] || "").trim();
        const column = (bracketed[3] || "").trim();
        return table && column ? { table, column } : null;
    }

    const separatorIndex = queryName.lastIndexOf(".");
    if (separatorIndex <= 0 || separatorIndex >= queryName.length - 1) {
        return null;
    }

    const table = queryName.slice(0, separatorIndex).replace(/^'|'$/g, "").trim();
    const column = queryName.slice(separatorIndex + 1).trim();
    return table && column ? { table, column } : null;
}
