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
import { formatNumber } from "./utils/formatting";
import { BasicFilter } from "powerbi-models";

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
    private crossFilterValues: Set<string> = new Set();

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
            this.selectionManager.showContextMenu(
                {},
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
            const categoryColors = [
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
                progressColor: design.progressColor.value.value,
                todayLineColor: design.todayLineColor.value.value,
                barOpacity: design.barOpacity.value,
                title: {
                    show: this.formattingSettings.titleCard.show.value,
                    text: this.formattingSettings.titleCard.titleText.value,
                    fontSize: this.formattingSettings.titleCard.fontSize.value,
                    fontColor: this.formattingSettings.titleCard.fontColor.value.value,
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
                    fontColor: this.formattingSettings.categoriesCard.fontColor.value.value
                },
                legend: {
                    show: this.formattingSettings.legendCard.show.value
                }
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

            // Expand body SVG if content exceeds viewport
            if (chart.requiredHeight > bodyHeight) {
                this.svg.attr("height", chart.requiredHeight);
            }

            this.addInteractivity();

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

        for (const cat of allCategories) {
            const role = cat.source.roles;
            if (role) {
                if (role["task"]) taskCol = cat;
            }
        }

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

        // Selection on bars
        if (interactionSettings.enableSelection.value) {
            this.chartContainer.selectAll("rect[data-dp-index]")
                .style("cursor", "pointer")
                .on("click", function(event: MouseEvent) {
                    event.stopPropagation();
                    const rowIdx = parseInt(d3.select(this).attr("data-dp-index"));
                    if (rowIdx >= 0 && rowIdx < self.selectionIds.length) {
                        const isMultiSelect = event.ctrlKey || event.metaKey;
                        self.selectionManager.select(self.selectionIds[rowIdx], isMultiSelect)
                            .then((ids: ISelectionId[]) => self.syncSelectionState(ids));
                    }
                });

            // Clear on empty click
            this.svg.on("click", function(event: MouseEvent) {
                const el = event.target as Element;
                if (el.tagName === "svg" || !d3.select(el).attr("data-dp-index")) {
                    self.selectionManager.clear().then(() => self.syncSelectionState([]));
                    self.clearCrossFilter();
                }
            });
        }

        // Tooltips on bars
        if (interactionSettings.enableTooltips.value) {
            this.chartContainer.selectAll("rect.gantt-bar[data-dp-index]")
                .on("mouseover", function(event: MouseEvent) {
                    const rowIdx = parseInt(d3.select(this).attr("data-dp-index"));
                    const task = self.parsedData?.tasks.find(t => t.rowIndex === rowIdx);
                    if (!task) return;
                    self.tooltipService.show({
                        dataItems: self.buildTaskTooltip(task),
                        identities: rowIdx < self.selectionIds.length ? [self.selectionIds[rowIdx]] : [],
                        coordinates: [event.clientX, event.clientY],
                        isTouchEvent: false
                    });
                })
                .on("mousemove", function(event: MouseEvent) {
                    const rowIdx = parseInt(d3.select(this).attr("data-dp-index"));
                    const task = self.parsedData?.tasks.find(t => t.rowIndex === rowIdx);
                    if (!task) return;
                    self.tooltipService.move({
                        dataItems: self.buildTaskTooltip(task),
                        identities: rowIdx < self.selectionIds.length ? [self.selectionIds[rowIdx]] : [],
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
        const items: VisualTooltipDataItem[] = [
            { displayName: "Task", value: task.name },
            { displayName: "Start", value: task.startDate.toLocaleDateString() },
            { displayName: "End", value: task.endDate.toLocaleDateString() }
        ];
        if (task.progress > 0) {
            items.push({ displayName: "Progress", value: `${Math.round(task.progress)}%` });
        }
        if (task.category) {
            items.push({ displayName: "Category", value: task.category });
        }
        if (task.tooltipFields && task.tooltipFields.length > 0) {
            items.push(...task.tooltipFields.map(f => ({ displayName: f.displayName, value: f.value })));
        }
        return items;
    }

    private syncSelectionState(selectionIds: ISelectionId[]): void {
        const hasSelection = selectionIds.length > 0;
        const defaultOpacity = String(this.formattingSettings.designCard.barOpacity.value / 100);

        this.chartContainer.selectAll("rect.gantt-bar[data-dp-index]")
            .style("opacity", hasSelection ? "0.3" : defaultOpacity);
        this.chartContainer.selectAll("rect.gantt-progress[data-dp-index]")
            .style("opacity", hasSelection ? "0.3" : defaultOpacity);

        if (hasSelection) {
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

            // Highlight matched bars
            this.parsedData?.tasks.forEach((task) => {
                if (selectedRows.has(task.rowIndex)) {
                    this.chartContainer.selectAll(`rect.gantt-bar[data-dp-index="${task.rowIndex}"]`)
                        .style("opacity", defaultOpacity);
                    this.chartContainer.selectAll(`rect.gantt-progress[data-dp-index="${task.rowIndex}"]`)
                        .style("opacity", defaultOpacity);
                }
            });
        }
    }

    private clearCrossFilter(): void {
        this.crossFilterValues.clear();
        try {
            (this.host as any).applyJsonFilter(null, "general", "filter", 0);
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
