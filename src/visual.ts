/*
 *  Power BI Visual CLI — Atlyn Gantt Chart
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import * as d3 from "d3";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.extensibility.ISelectionId;
import DataView = powerbi.DataView;
import ITooltipService = powerbi.extensibility.ITooltipService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

import { VisualFormattingSettingsModel } from "./settings";
import { parseDataView, ParsedData, GanttTask } from "./dataParser";
import { GanttChart, GanttSettings, GanttDimensions } from "./ganttChart";
import { BasicFilter } from "powerbi-models";

type FilterValue = string | number | boolean;
type FilterTarget = { table: string; column: string };

interface HostPaletteColors {
    isHighContrast: boolean;
    foreground: string;
    background: string;
    foregroundSelected: string;
    hyperlink: string;
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private headerSvg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private headerContainer: d3.Selection<SVGGElement, unknown, null, undefined>;
    private scrollBody: HTMLDivElement;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private chartContainer: d3.Selection<SVGGElement, unknown, null, undefined>;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    private host: IVisualHost;
    private selectionManager: ISelectionManager;
    private tooltipService: ITooltipService;

    private dataView: DataView;
    private parsedData: ParsedData | null;
    private selectionIds: ISelectionId[] = [];
    private currentSelectionIds: ISelectionId[] = [];
    private crossFilterValues: Set<FilterValue> = new Set();
    private crossFilterTarget: FilterTarget | null = null;
    private taskColumn: powerbi.DataViewCategoryColumn | null = null;
    private categoryColumn: powerbi.DataViewCategoryColumn | null = null;

    constructor(options: VisualConstructorOptions) {
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;
        this.host = options.host;

        this.target.style.overflow = "hidden";
        this.target.style.display = "flex";
        this.target.style.flexDirection = "column";

        this.selectionManager = this.host.createSelectionManager();
        this.tooltipService = this.host.tooltipService;

        this.selectionManager.registerOnSelectCallback((ids: ISelectionId[]) => {
            this.syncSelectionState(ids);
        });

        // Fixed header SVG for x-axis
        this.headerSvg = d3.select(this.target)
            .append("svg")
            .classed("ganttChart ganttHeader", true)
            .style("flex-shrink", "0");
        this.headerContainer = this.headerSvg.append("g")
            .classed("headerContainer", true);

        // Scrollable body div
        this.scrollBody = document.createElement("div");
        this.scrollBody.style.flex = "1";
        this.scrollBody.style.overflowY = "auto";
        this.scrollBody.style.overflowX = "hidden";
        this.target.appendChild(this.scrollBody);

        this.svg = d3.select(this.scrollBody)
            .append("svg")
            .classed("ganttChart", true);

        this.chartContainer = this.svg.append("g")
            .classed("chartContainer", true);

        this.svg.on("contextmenu", (event: MouseEvent) => {
            event.preventDefault();
            const selectionId = this.getSelectionIdFromEvent(event) ?? {};
            this.selectionManager.showContextMenu(
                selectionId,
                { x: event.clientX, y: event.clientY }
            );
        });
    }

    public update(options: VisualUpdateOptions) {
        this.host.eventService?.renderingStarted(options);

        try {
            this.chartContainer.selectAll("*").remove();
            this.chartContainer.attr("transform", null);
            this.headerContainer.selectAll("*").remove();
            this.selectionIds = [];

            this.dataView = options.dataViews?.[0];
            if (!this.dataView) {
                this.headerSvg.attr("height", 0);
                this.renderLandingPage();
                this.host.eventService?.renderingFinished(options);
                return;
            }

            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                this.dataView
            );

            const width = Math.min(options.viewport.width, this.target.clientWidth) || options.viewport.width;
            const height = Math.min(options.viewport.height, this.target.clientHeight) || options.viewport.height;

            const headerHeight = 30;
            this.headerSvg.attr("width", width).attr("height", headerHeight);
            this.svg.attr("width", width).attr("height", height - headerHeight);

            this.parsedData = parseDataView(this.dataView);

            if (!this.parsedData || this.parsedData.tasks.length === 0) {
                this.headerSvg.attr("height", 0);
                this.renderLandingPage();
                this.host.eventService?.renderingFinished(options);
                return;
            }

            this.createSelectionIds();

            const design = this.formattingSettings.designCard;
            const palette = this.getHostPaletteColors();
            this.applyThemeStyles(palette);
            const categoryColors = palette.isHighContrast ? [
                palette.foregroundSelected,
                palette.foreground,
                palette.hyperlink
            ] : [
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

            const settings: GanttSettings = {
                showTodayLine: this.formattingSettings.chartSettingsCard.showTodayLine.value,
                showGridLines: this.formattingSettings.chartSettingsCard.showGridLines.value,
                barHeight: this.formattingSettings.chartSettingsCard.barHeight.value,
                barCornerRadius: this.formattingSettings.chartSettingsCard.barCornerRadius.value,
                categoryColors,
                progressColor: palette.isHighContrast ? palette.foreground : design.progressColor.value.value,
                todayLineColor: palette.isHighContrast ? palette.hyperlink : design.todayLineColor.value.value,
                barOpacity: design.barOpacity.value,
                title: {
                    show: this.formattingSettings.titleCard.show.value,
                    text: this.formattingSettings.titleCard.titleText.value,
                    fontSize: this.formattingSettings.titleCard.fontSize.value,
                    fontColor: palette.isHighContrast ? palette.foreground : this.formattingSettings.titleCard.fontColor.value.value,
                    alignment: String(this.formattingSettings.titleCard.alignment.value.value) as any
                },
                dataLabels: {
                    show: this.formattingSettings.dataLabelsCard.show.value,
                    fontSize: this.formattingSettings.dataLabelsCard.fontSize.value,
                    showProgress: this.formattingSettings.dataLabelsCard.showProgress.value
                },
                categories: {
                    show: this.formattingSettings.categoriesCard.show.value,
                    fontSize: this.formattingSettings.categoriesCard.fontSize.value,
                    fontColor: palette.isHighContrast ? palette.foreground : this.formattingSettings.categoriesCard.fontColor.value.value
                },
                legend: {
                    show: this.formattingSettings.legendCard.show.value
                },
                gridLineColor: palette.isHighContrast ? palette.foreground : "#e0e0e0",
                separatorLineColor: palette.isHighContrast ? palette.foreground : "#e0e0e0",
                axisColor: palette.isHighContrast ? palette.foreground : "#666666",
                legendTextColor: palette.isHighContrast ? palette.foreground : "#666666",
                isHighContrast: palette.isHighContrast,
                highContrastBackgroundColor: palette.background
            };

            // Compute left margin based on longest y-axis label
            const longestName = this.parsedData.tasks.reduce((max, t) => t.name.length > max.length ? t.name : max, "");
            const estimatedLabelWidth = Math.min(longestName.length * 7 + 16, width * 0.35);
            const leftMargin = Math.max(120, estimatedLabelWidth);

            const bodyHeight = height - headerHeight;
            const dimensions: GanttDimensions = {
                width, height: bodyHeight,
                margin: { top: 10, right: 30, bottom: 0, left: leftMargin }
            };

            const chart = new GanttChart(this.chartContainer, this.parsedData, settings, dimensions, this.headerContainer);
            chart.render();

            if (this.parsedData.invalidDateRows > 0) {
                this.showInvalidDateWarning(this.parsedData.invalidDateRows);
            }

            // Expand body SVG if content exceeds viewport
            if (chart.requiredHeight > bodyHeight) {
                this.svg.attr("height", chart.requiredHeight);
            }

            this.addInteractivity();
            this.applyVisualStates();

            this.host.eventService?.renderingFinished(options);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.host.eventService?.renderingFailed(options, errorMessage);
            throw error;
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    private createSelectionIds(): void {
        if (!this.dataView?.categorical?.categories) return;
        const allCategories = this.dataView.categorical.categories;

        let taskCol: powerbi.DataViewCategoryColumn | null = null;
        let categoryCol: powerbi.DataViewCategoryColumn | null = null;

        for (const cat of allCategories) {
            const role = cat.source.roles;
            if (role) {
                if (role["task"]) taskCol = cat;
                if (role["category"]) categoryCol = cat;
            }
        }

        this.taskColumn = taskCol;
        this.categoryColumn = categoryCol;
        if (!taskCol) return;
        this.selectionIds = [];

        for (let i = 0; i < taskCol.values.length; i++) {
            const builder = this.host.createSelectionIdBuilder()
                .withCategory(taskCol, i);
            this.selectionIds.push(builder.createSelectionId());
        }
    }

    private addInteractivity(): void {
        const interactionSettings = this.formattingSettings.interactionCard;
        const self = this;
        const taskBars = this.chartContainer.selectAll<SVGRectElement, GanttTask>("rect.gantt-bar[data-dp-index]");

        // Selection on bars
        if (interactionSettings.enableSelection.value) {
            taskBars
                .style("cursor", "pointer")
                .on("click", function(event: MouseEvent) {
                    event.stopPropagation();
                    const rowIdx = self.getRowIndexFromElement(this);
                    self.selectTask(rowIdx, event.ctrlKey || event.metaKey);
                })
                .on("keydown", function(event: KeyboardEvent) {
                    const rowIdx = self.getRowIndexFromElement(this);
                    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
                        event.preventDefault();
                        event.stopPropagation();
                        self.selectTask(rowIdx, event.ctrlKey || event.metaKey);
                    } else if (event.key === "Escape") {
                        event.preventDefault();
                        event.stopPropagation();
                        self.clearSelectionAndFilter();
                    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                        event.preventDefault();
                        event.stopPropagation();
                        self.showContextMenuForRow(rowIdx, this);
                    }
                });

            // Clear on empty click
            this.svg.on("click", function(event: MouseEvent) {
                const el = event.target as Element;
                if (el.tagName === "svg" || !self.findDataElement(el)) {
                    self.clearSelectionAndFilter();
                }
            });
        }

        // Tooltips on bars
        if (interactionSettings.enableTooltips.value) {
            taskBars
                .on("mouseover", function(event: MouseEvent) {
                    const rowIdx = self.getRowIndexFromElement(this);
                    const task = self.getTaskByRowIndex(rowIdx);
                    if (!task) return;
                    self.tooltipService.show({
                        dataItems: self.buildTaskTooltip(task),
                        identities: self.selectionIds[rowIdx] ? [self.selectionIds[rowIdx]] : [],
                        coordinates: [event.clientX, event.clientY],
                        isTouchEvent: false
                    });
                })
                .on("mousemove", function(event: MouseEvent) {
                    const rowIdx = self.getRowIndexFromElement(this);
                    const task = self.getTaskByRowIndex(rowIdx);
                    if (!task) return;
                    self.tooltipService.move({
                        dataItems: self.buildTaskTooltip(task),
                        identities: self.selectionIds[rowIdx] ? [self.selectionIds[rowIdx]] : [],
                        coordinates: [event.clientX, event.clientY],
                        isTouchEvent: false
                    });
                })
                .on("mouseout", function() {
                    self.tooltipService.hide({ immediately: true, isTouchEvent: false });
                });
        }
    }

    private buildTaskTooltip(task: GanttTask): VisualTooltipDataItem[] {
        const useHighlight = this.parsedData?.hasHighlights && task.isHighlighted;
        const startDate = useHighlight && task.highlightStartDate ? task.highlightStartDate : task.startDate;
        const endDate = useHighlight && task.highlightEndDate ? task.highlightEndDate : task.endDate;
        const progress = useHighlight && task.highlightProgress !== undefined ? task.highlightProgress : task.progress;
        const tooltipFields = useHighlight && task.highlightTooltipFields && task.highlightTooltipFields.length > 0
            ? task.highlightTooltipFields
            : task.tooltipFields;
        const items: VisualTooltipDataItem[] = [
            { displayName: "Task", value: task.name },
            { displayName: "Start", value: startDate.toLocaleDateString() },
            { displayName: "End", value: endDate.toLocaleDateString() }
        ];
        if (progress > 0) {
            items.push({ displayName: "Progress", value: `${Math.round(progress)}%` });
        }
        if (task.category) {
            items.push({ displayName: "Category", value: task.category });
        }
        if (tooltipFields && tooltipFields.length > 0) {
            items.push(...tooltipFields.map(f => ({ displayName: f.displayName, value: f.value })));
        }
        return items;
    }

    private syncSelectionState(selectionIds: ISelectionId[]): void {
        this.currentSelectionIds = selectionIds || [];
        this.applyVisualStates();
    }

    private applyVisualStates(): void {
        const selectionIds = this.currentSelectionIds;
        const hasSelection = selectionIds.length > 0;
        const defaultOpacity = String(this.formattingSettings.designCard.barOpacity.value / 100);
        const dimmedOpacity = "0.3";
        const selectedRows = this.getSelectedRows(selectionIds);
        const tasksByRow = new Map<number, GanttTask>();
        this.parsedData?.tasks.forEach(task => tasksByRow.set(task.rowIndex, task));
        const hasHighlights = !!this.parsedData?.hasHighlights;

        this.chartContainer.selectAll<SVGRectElement, GanttTask>("rect.gantt-bar[data-dp-index]")
            .each(function() {
                const rowIdx = parseInt(d3.select(this).attr("data-dp-index"));
                const task = tasksByRow.get(rowIdx);
                const isSelected = selectedRows.has(rowIdx);
                const dimmedBySelection = hasSelection && !isSelected;
                const dimmedByHighlight = hasHighlights && !!task && !task.isHighlighted;
                d3.select(this)
                    .style("opacity", dimmedBySelection || dimmedByHighlight ? dimmedOpacity : defaultOpacity)
                    .classed("gantt-dimmed", dimmedBySelection || dimmedByHighlight)
                    .attr("aria-pressed", isSelected ? "true" : "false");
            });

        this.chartContainer.selectAll<SVGRectElement, GanttTask>("rect.gantt-progress[data-dp-index]")
            .each(function() {
                const rowIdx = parseInt(d3.select(this).attr("data-dp-index"));
                const task = tasksByRow.get(rowIdx);
                const dimmedBySelection = hasSelection && !selectedRows.has(rowIdx);
                const dimmedByHighlight = hasHighlights && !!task && !task.isHighlighted;
                d3.select(this)
                    .style("opacity", dimmedBySelection || dimmedByHighlight ? dimmedOpacity : defaultOpacity)
                    .classed("gantt-dimmed", dimmedBySelection || dimmedByHighlight);
            });
    }

    private clearCrossFilter(): void {
        this.crossFilterValues.clear();
        this.crossFilterTarget = null;
        try {
            (this.host as any).applyJsonFilter(null, "general", "filter", 1);
        } catch { /* ignore */ }
    }

    private getSelectedRows(selectionIds: ISelectionId[]): Set<number> {
        const selectedKeys = new Set<string>();
        for (const sid of selectionIds) {
            try { const key = (sid as any).getKey?.(); if (key) selectedKeys.add(key); } catch { /* ignore */ }
        }

        const selectedRows = new Set<number>();
        for (let i = 0; i < this.selectionIds.length; i++) {
            let matched = false;
            for (const sid of selectionIds) {
                try { if ((this.selectionIds[i] as any).equals?.(sid)) { matched = true; break; } } catch { /* ignore */ }
            }
            if (!matched && selectedKeys.size > 0) {
                try { const k = (this.selectionIds[i] as any).getKey?.(); if (k && selectedKeys.has(k)) matched = true; } catch { /* ignore */ }
            }
            if (matched) selectedRows.add(i);
        }
        return selectedRows;
    }

    private selectTask(rowIdx: number, isMultiSelect: boolean): void {
        if (!Number.isFinite(rowIdx) || rowIdx < 0 || !this.selectionIds[rowIdx]) return;

        this.selectionManager.select(this.selectionIds[rowIdx], isMultiSelect)
            .then((ids: ISelectionId[]) => this.syncSelectionState(ids));

        if (this.getCrossFilterMode() === "filter") {
            this.applyCrossFilter(rowIdx, isMultiSelect);
        }
    }

    private clearSelectionAndFilter(): void {
        this.selectionManager.clear().then(() => this.syncSelectionState([]));
        this.clearCrossFilter();
    }

    private applyCrossFilter(rowIdx: number, isMultiSelect: boolean): void {
        const filterInfo = this.getFilterInfoForRow(rowIdx);
        if (!filterInfo) return;

        if (!this.crossFilterTarget
            || this.crossFilterTarget.table !== filterInfo.target.table
            || this.crossFilterTarget.column !== filterInfo.target.column) {
            this.crossFilterValues.clear();
            this.crossFilterTarget = filterInfo.target;
        }

        if (!isMultiSelect) {
            this.crossFilterValues.clear();
            this.crossFilterValues.add(filterInfo.value);
        } else if (this.crossFilterValues.has(filterInfo.value)) {
            this.crossFilterValues.delete(filterInfo.value);
        } else {
            this.crossFilterValues.add(filterInfo.value);
        }

        if (this.crossFilterValues.size === 0) {
            this.clearCrossFilter();
            return;
        }

        const filter = new BasicFilter(filterInfo.target, "In", Array.from(this.crossFilterValues));
        try {
            (this.host as any).applyJsonFilter(filter.toJSON(), "general", "filter", 0);
        } catch { /* ignore */ }
    }

    private getFilterInfoForRow(rowIdx: number): { target: FilterTarget; value: FilterValue } | null {
        const taskInfo = this.getFilterInfo(this.taskColumn, rowIdx);
        if (taskInfo) return taskInfo;
        return this.getFilterInfo(this.categoryColumn, rowIdx);
    }

    private getFilterInfo(column: powerbi.DataViewCategoryColumn | null, rowIdx: number): { target: FilterTarget; value: FilterValue } | null {
        const value = column?.values?.[rowIdx];
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
        const target = this.getFilterTarget(column);
        return target ? { target, value } : null;
    }

    private getFilterTarget(column: powerbi.DataViewCategoryColumn | null): FilterTarget | null {
        const queryName = column?.source?.queryName;
        if (!queryName) return null;
        const separatorIndex = queryName.lastIndexOf(".");
        if (separatorIndex <= 0 || separatorIndex >= queryName.length - 1) return null;
        return {
            table: queryName.slice(0, separatorIndex),
            column: queryName.slice(separatorIndex + 1)
        };
    }

    private getCrossFilterMode(): string {
        return String(this.formattingSettings.interactionCard.crossFilterMode.value.value);
    }

    private getRowIndexFromElement(element: Element): number {
        return parseInt(d3.select(element).attr("data-dp-index"));
    }

    private getTaskByRowIndex(rowIdx: number): GanttTask | undefined {
        return this.parsedData?.tasks.find(task => task.rowIndex === rowIdx);
    }

    private findDataElement(element: Element | null): Element | null {
        return element?.closest?.("[data-dp-index]") ?? null;
    }

    private getSelectionIdFromEvent(event: Event): ISelectionId | null {
        const dataElement = this.findDataElement(event.target as Element);
        if (!dataElement) return null;
        const rowIdx = this.getRowIndexFromElement(dataElement);
        return this.selectionIds[rowIdx] ?? null;
    }

    private showContextMenuForRow(rowIdx: number, element: Element): void {
        const selectionId = this.selectionIds[rowIdx] ?? {};
        const rect = element.getBoundingClientRect();
        this.selectionManager.showContextMenu(selectionId, {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        });
    }

    private getHostPaletteColors(): HostPaletteColors {
        const palette: any = this.host.colorPalette || {};
        const getColor = (fill: any, fallback: string) => fill?.solid?.color || fallback;
        return {
            isHighContrast: !!palette.isHighContrast,
            foreground: getColor(palette.foreground, "#252423"),
            background: getColor(palette.background, "#ffffff"),
            foregroundSelected: getColor(palette.foregroundSelected, "#1f639e"),
            hyperlink: getColor(palette.hyperlink, "#0078d4")
        };
    }

    private applyThemeStyles(palette: HostPaletteColors): void {
        const focusColor = palette.isHighContrast ? palette.hyperlink : "#0078d4";
        this.target.style.setProperty("--gantt-focus-color", focusColor);
        this.target.style.backgroundColor = palette.isHighContrast ? palette.background : "";
        this.target.style.color = palette.isHighContrast ? palette.foreground : "";
    }

    private showInvalidDateWarning(count: number): void {
        try {
            this.host.displayWarningIcon?.(
                "Some Gantt rows were skipped",
                `${count} row${count === 1 ? "" : "s"} had missing or invalid start/end dates and were not rendered.`
            );
        } catch { /* ignore */ }
    }

    private renderLandingPage(): void {
        this.chartContainer.selectAll("*").remove();
        const w = parseInt(this.svg.attr("width")) || 400;
        const h = parseInt(this.svg.attr("height")) || 300;

        this.chartContainer.append("rect")
            .attr("width", w).attr("height", h).attr("fill", "#fafafa");
        this.chartContainer.append("text")
            .attr("x", w / 2).attr("y", h / 2 - 10)
            .attr("text-anchor", "middle").attr("fill", "#999")
            .attr("font-size", "14px").attr("font-weight", "bold")
            .text("Atlyn Gantt Chart");
        this.chartContainer.append("text")
            .attr("x", w / 2).attr("y", h / 2 + 14)
            .attr("text-anchor", "middle").attr("fill", "#bbb")
            .attr("font-size", "11px")
            .text("Add Task, Start Date, and End Date fields");
    }
}
