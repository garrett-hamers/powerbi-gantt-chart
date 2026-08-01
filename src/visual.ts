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

import {
    VisualFormattingSettingsModel,
    localizeNewFormattingStrings
} from "./settings";
import {
    GanttTask,
    ParseDiagnostics,
    ParsedData,
    ProgressInterpretation,
    ReversedDateHandling,
    TaskFilterValue,
    CATEGORICAL_ROW_LIMIT,
    parseDataViewWithDiagnostics
} from "./dataParser";
import { GanttChart, GanttDimensions, GanttSettings } from "./ganttChart";
import { clampNumber, truncateText } from "./utils/formatting";
import { createTextGetter } from "./localization";

type CrossFilterMode = "highlight" | "filter";

const EMPTY_SELECTION_ID: HostSelectionId = {};
const EMPTY_FILTER = null as unknown as powerbi.IFilter;
const MERGE_FILTER_ACTION: powerbi.FilterAction.merge = 0;
const REMOVE_FILTER_ACTION: powerbi.FilterAction.remove = 1;
const MAX_RENDERED_ROWS = 200;
const VIRTUAL_OVERSCAN_ROWS = 10;
const TOUCH_CONTEXT_DELAY_MS = 600;
const TOUCH_MOVE_TOLERANCE_PX = 8;
const RESIZE_UPDATE_TYPE: powerbi.VisualUpdateType = 1 << 2;
const RESIZE_END_UPDATE_TYPE: powerbi.VisualUpdateType = 1 << 5;
const EMPTY_DIAGNOSTICS: ParseDiagnostics = {
    ambiguousProgress: false,
    correctedReversedDates: 0,
    excludedReversedDates: 0,
    invalidRows: 0,
    duplicateTaskIds: 0,
    blankTaskIds: 0,
    hasDataSegment: false,
    atCategoricalRowLimit: false
};

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
    private readonly getText: (key: string, ...values: Array<string | number>) => string;

    private formattingSettings = new VisualFormattingSettingsModel();
    private dataView: DataView | undefined;
    private parsedData: ParsedData | null = null;
    private currentSettings: GanttSettings | null = null;
    private selectionIds = new Map<number, SelectionId>();
    private crossFilterValues = new Map<string, TaskFilterValue>();
    private taskFilterTarget: IFilterColumnTarget | null = null;
    private crossFilterMode: CrossFilterMode = "highlight";
    private parseDiagnostics: ParseDiagnostics = { ...EMPTY_DIAGNOSTICS };
    private lastViewport: powerbi.IViewport | null = null;
    private activeRowIndex = -1;
    private renderedWindowStart = 0;
    private renderedWindowEnd = 0;
    private virtualRowHeight = 0;
    private isVirtualized = false;
    private pendingFocusRowIndex: number | null = null;
    private selectionIdentityQueryName: string | undefined;
    private selectionResetPending = false;
    private touchContextTimer: ReturnType<typeof setTimeout> | null = null;
    private touchStart: { x: number; y: number } | null = null;
    private touchMoved = false;
    private touchContextTriggered = false;
    private suppressClickUntil = 0;
    private destroyed = false;

    private readonly handleScroll = (): void => {
        if (!this.isVirtualized || !this.lastViewport || !this.parsedData || !this.currentSettings) {
            return;
        }
        const nextStart = this.calculateVirtualWindow(this.parsedData.tasks.length).start;
        if (nextStart !== this.renderedWindowStart) {
            this.renderParsedChart();
        }
    };

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
        this.getText = createTextGetter(this.host.createLocalizationManager?.());
        localizeNewFormattingStrings(this.formattingSettings, this.getText);

        this.target.classList.add("gantt-root");
        this.target.setAttribute("role", "region");
        this.target.setAttribute("aria-label", this.getText("Visual_Name"));
        this.target.style.overflow = "hidden";
        this.target.style.display = "flex";
        this.target.style.flexDirection = "column";
        this.target.dir = isRtlLocale(this.host.locale || "en-US") ? "rtl" : "ltr";

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
        this.scrollBody.addEventListener("scroll", this.handleScroll, { passive: true });

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
        if (this.destroyed) {
            return;
        }
        this.events.renderingStarted(options);

        try {
            if (this.canUseCachedResize(options)) {
                this.resizeOnly(options.viewport);
            } else {
                this.render(options);
            }
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
        this.destroyed = true;
        this.headerSvg.on(".gantt", null);
        this.headerSvg.on(".gantt-clear", null);
        this.svg.on(".gantt", null).on(".gantt-clear", null);
        this.chartContainer.selectAll<SVGElement, unknown>("*")
            .on(".gantt", null)
            .on(".gantt-touch", null)
            .on(".gantt-roving", null)
            .on(".gantt-clear", null);
        this.tooltipService.hide({ immediately: true, isTouchEvent: false });
        this.scrollBody.removeEventListener("scroll", this.handleScroll);
        this.clearTouchContextTimer();
        this.selectionIds.clear();
        this.crossFilterValues.clear();
        this.taskFilterTarget = null;
        this.dataView = undefined;
        this.parsedData = null;
        this.currentSettings = null;
        this.pendingFocusRowIndex = null;
        this.lastViewport = null;
        this.selectionIdentityQueryName = undefined;
        this.selectionResetPending = false;
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
        this.crossFilterValues.clear();
        this.taskFilterTarget = null;
        this.parsedData = null;
        this.currentSettings = null;
        this.parseDiagnostics = { ...EMPTY_DIAGNOSTICS };
        this.lastViewport = { width, height };
        this.isVirtualized = false;
        this.svg
            .on("click.gantt-clear", null)
            .on("keydown.gantt-clear", null)
            .classed("filter-clearable", false)
            .attr("tabindex", null)
            .attr("aria-keyshortcuts", null);

        this.headerSvg.attr("width", width).attr("height", headerHeight);
        this.svg.attr("width", width).attr("height", bodyHeight);

        this.dataView = options.dataViews?.[0];
        if (!this.dataView) {
            this.resetSelectionIfIdentityChanged(undefined);
            this.formattingSettings = new VisualFormattingSettingsModel();
            localizeNewFormattingStrings(this.formattingSettings, this.getText);
            this.headerSvg.attr("height", 0);
            this.svg.attr("height", height);
            this.renderLandingPage(width, height);
            return;
        }

        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel,
            this.dataView
        );
        localizeNewFormattingStrings(this.formattingSettings, this.getText);
        this.crossFilterMode = this.getCrossFilterMode();
        const parseResult = parseDataViewWithDiagnostics(
            this.dataView,
            this.host.locale || "en-US",
            {
                progressInterpretation: this.getProgressInterpretation(),
                reversedDateHandling: this.getReversedDateHandling(),
                milestoneLabel: this.getText("Duration_Milestone")
            }
        );
        this.parsedData = parseResult.data;
        this.parseDiagnostics = parseResult.diagnostics;
        const identitySource = findIdentitySource(this.dataView, this.parsedData);
        this.resetSelectionIfIdentityChanged(identitySource?.queryName);
        this.taskFilterTarget = identitySource ? getFilterTarget(identitySource) : null;
        if (options.jsonFilters !== undefined) {
            this.hydrateCrossFilterValues(options.jsonFilters);
        }
        this.showDataQualityWarning();
        if (!this.parsedData?.tasks.length) {
            this.headerSvg.attr("height", 0);
            this.svg.attr("height", height);
            this.renderLandingPage(width, height);
            return;
        }

        this.createSelectionIds();
        this.currentSettings = this.buildSettings(this.parsedData);
        if (!this.parsedData.tasks.some(task => task.rowIndex === this.activeRowIndex)) {
            this.activeRowIndex = this.parsedData.tasks[0]?.rowIndex ?? -1;
        }
        this.renderParsedChart();
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
        const focusColor = palette.foregroundSelected?.value || "#0078d4";
        const interactionsEnabled = this.host.hostCapabilities?.allowInteractions !== false;
        const titleFontColor = this.hasFormattingProperty("title", "fontColor")
            ? this.formattingSettings.titleCard.fontColor.value.value
            : foregroundColor;
        const categoryFontColor = this.hasFormattingProperty("categories", "fontColor")
            ? this.formattingSettings.categoriesCard.fontColor.value.value
            : foregroundColor;
        this.applyHostColorBoundary(
            foregroundColor,
            backgroundColor,
            focusColor,
            palette.isHighContrast
        );

        return {
            instanceId: this.host.instanceId || "visual",
            activeRowIndex: this.activeRowIndex,
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
            strings: {
                milestoneOn: this.getText("Aria_MilestoneOn"),
                taskRange: this.getText("Aria_TaskRange"),
                progress: this.getText("Aria_Progress"),
                category: this.getText("Aria_Category")
            },
            title: {
                show: this.formattingSettings.titleCard.show.value,
                text: truncateText(this.formattingSettings.titleCard.titleText.value),
                fontSize: clampNumber(this.formattingSettings.titleCard.fontSize.value, 8, 72, 16),
                fontColor: titleFontColor || foregroundColor,
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
                fontColor: categoryFontColor || foregroundColor
            },
            legend: {
                show: this.formattingSettings.legendCard.show.value
            }
        };
    }

    private canUseCachedResize(options: VisualUpdateOptions): boolean {
        if (!this.parsedData || !this.currentSettings || !this.lastViewport) {
            return false;
        }

        const resizeFlags = RESIZE_UPDATE_TYPE | RESIZE_END_UPDATE_TYPE;
        return (options.type & resizeFlags) !== 0
            && (options.type & ~resizeFlags) === 0;
    }

    private resizeOnly(viewport: powerbi.IViewport): void {
        const scrollTop = this.scrollBody.scrollTop;
        const width = normalizeViewportDimension(viewport.width);
        const height = normalizeViewportDimension(viewport.height);
        this.lastViewport = { width, height };
        this.renderParsedChart();
        this.scrollBody.scrollTop = scrollTop;
    }

    private renderParsedChart(): void {
        if (!this.parsedData || !this.currentSettings || !this.lastViewport) {
            return;
        }

        const width = normalizeViewportDimension(this.lastViewport.width);
        const height = normalizeViewportDimension(this.lastViewport.height);
        const headerHeight = Math.min(30, height);
        const bodyHeight = Math.max(0, height - headerHeight);
        const allTasks = this.parsedData.tasks;
        const longestName = allTasks.reduce(
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
        const virtualWindow = this.calculateVirtualWindow(allTasks.length);
        const visibleTasks = allTasks.slice(virtualWindow.start, virtualWindow.end);
        const visibleData: ParsedData = {
            ...this.parsedData,
            tasks: visibleTasks
        };
        const dimensions: GanttDimensions = {
            width,
            height: bodyHeight,
            margin: { top: 10, right: rightMargin, bottom: 0, left: leftMargin },
            rowWindow: virtualWindow.enabled
                ? {
                    offset: virtualWindow.start,
                    totalCount: allTasks.length,
                    rowHeight: virtualWindow.rowHeight
                }
                : undefined
        };

        this.currentSettings.activeRowIndex = visibleTasks.some(
            task => task.rowIndex === this.activeRowIndex
        )
            ? this.activeRowIndex
            : visibleTasks[0]?.rowIndex ?? this.activeRowIndex;
        this.chartContainer.selectAll("*").remove();
        this.headerContainer.selectAll("*").remove();
        this.svg
            .on("click.gantt-clear", null)
            .on("keydown.gantt-clear", null)
            .classed("filter-clearable", false);
        this.headerSvg.attr("width", width).attr("height", headerHeight);
        this.svg.attr("width", width);

        const chart = new GanttChart(
            this.chartContainer,
            visibleData,
            this.currentSettings,
            dimensions,
            this.headerContainer
        );
        chart.render();

        this.isVirtualized = virtualWindow.enabled;
        this.virtualRowHeight = virtualWindow.rowHeight;
        this.renderedWindowStart = virtualWindow.start;
        this.renderedWindowEnd = virtualWindow.end;
        const renderedHeight = Math.max(bodyHeight, chart.requiredHeight);
        this.svg.attr("height", renderedHeight);
        this.scrollBody.style.overflowY = chart.requiredHeight > bodyHeight ? "auto" : "hidden";
        const taskWord = allTasks.length === 1
            ? this.getText("Chart_Task")
            : this.getText("Chart_Tasks");
        this.svg
            .attr("role", "group")
            .attr("aria-label", this.getText("Aria_ChartTasks", allTasks.length, taskWord));

        this.addInteractivity();
        if (this.crossFilterMode === "filter" && this.crossFilterValues.size > 0) {
            this.syncFilterState();
            this.selectionResetPending = false;
        } else if (this.selectionResetPending) {
            this.selectionResetPending = false;
            this.syncSelectionState([]);
        } else {
            this.syncSelectionState(this.selectionManager.getSelectionIds());
        }

        if (this.pendingFocusRowIndex !== null) {
            const rowIndex = this.pendingFocusRowIndex;
            this.pendingFocusRowIndex = null;
            this.target.querySelector<SVGGraphicsElement>(
                `.gantt-data-point[data-dp-index="${rowIndex}"]`
            )?.focus();
        }
    }

    private calculateVirtualWindow(taskCount: number): {
        enabled: boolean;
        start: number;
        end: number;
        rowHeight: number;
    } {
        const rowHeight = Math.min(106, Math.max(10, (this.currentSettings?.barHeight ?? 24) + 6));
        if (taskCount <= MAX_RENDERED_ROWS || !this.lastViewport) {
            return { enabled: false, start: 0, end: taskCount, rowHeight };
        }

        const bodyHeight = Math.max(0, normalizeViewportDimension(this.lastViewport.height) - 30);
        const firstVisible = Math.max(0, Math.floor(this.scrollBody.scrollTop / rowHeight));
        const visibleCount = Math.max(1, Math.ceil(bodyHeight / rowHeight));
        const start = Math.max(0, firstVisible - VIRTUAL_OVERSCAN_ROWS);
        const end = Math.min(
            taskCount,
            Math.max(
                start + 1,
                firstVisible + visibleCount + VIRTUAL_OVERSCAN_ROWS
            )
        );
        return {
            enabled: true,
            start,
            end: Math.min(end, start + MAX_RENDERED_ROWS),
            rowHeight
        };
    }

    private getProgressInterpretation(): ProgressInterpretation {
        const value = String(
            this.formattingSettings.chartSettingsCard.progressInterpretation.value.value
        );
        return value === "fraction" || value === "percent" ? value : "auto";
    }

    private getReversedDateHandling(): ReversedDateHandling {
        const value = String(
            this.formattingSettings.chartSettingsCard.reversedDateHandling.value.value
        );
        return value === "exclude" ? "exclude" : "correct";
    }

    private showDataQualityWarning(): void {
        const diagnostics = this.parseDiagnostics;
        const details: string[] = [];
        if (diagnostics.ambiguousProgress) {
            details.push(this.getText("Warning_AmbiguousProgress"));
        }
        if (diagnostics.correctedReversedDates > 0) {
            details.push(this.getText(
                "Warning_ReversedCorrected",
                diagnostics.correctedReversedDates
            ));
        }
        if (diagnostics.excludedReversedDates > 0) {
            details.push(this.getText(
                "Warning_ReversedExcluded",
                diagnostics.excludedReversedDates
            ));
        }
        if (diagnostics.invalidRows > 0) {
            details.push(this.getText("Warning_InvalidRows", diagnostics.invalidRows));
        }
        if (diagnostics.duplicateTaskIds > 0) {
            details.push(this.getText(
                "Warning_DuplicateTaskIds",
                diagnostics.duplicateTaskIds
            ));
        }
        if (diagnostics.blankTaskIds > 0) {
            details.push(this.getText("Warning_BlankTaskIds"));
        }
        if (diagnostics.hasDataSegment) {
            details.push(this.getText("Warning_DataSegment", CATEGORICAL_ROW_LIMIT));
        } else if (diagnostics.atCategoricalRowLimit) {
            details.push(this.getText("Warning_DataReductionLimit", CATEGORICAL_ROW_LIMIT));
        }

        this.host.displayWarningIcon?.(
            details.length > 0 ? this.getText("Warning_DataQualityTitle") : "",
            details.join("\n")
        );
    }

    private hasFormattingProperty(objectName: string, propertyName: string): boolean {
        const object = this.dataView?.metadata?.objects?.[objectName];
        return object !== undefined
            && object !== null
            && Object.prototype.hasOwnProperty.call(object, propertyName);
    }

    private applyHostColorBoundary(
        foregroundColor: string,
        backgroundColor: string,
        focusColor: string,
        isHighContrast: boolean
    ): void {
        this.target.style.setProperty("--gantt-foreground-color", foregroundColor);
        this.target.style.setProperty("--gantt-background-color", backgroundColor);
        this.target.style.setProperty("--gantt-focus-color", focusColor);
        this.target.classList.toggle("gantt-high-contrast", isHighContrast);

        if (isHighContrast) {
            this.target.style.color = foregroundColor;
            this.target.style.backgroundColor = backgroundColor;
        } else {
            this.target.style.removeProperty("color");
            this.target.style.removeProperty("background-color");
        }
    }

    private createSelectionIds(): void {
        const identityColumn = this.dataView?.categorical?.categories?.find(category =>
            this.parsedData?.taskIdentityMode === "taskId"
                ? category.source.roles?.taskId
                : category.source.roles?.task
        );
        if (!identityColumn) {
            return;
        }

        for (let rowIndex = 0; rowIndex < identityColumn.values.length; rowIndex++) {
            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(identityColumn, rowIndex)
                .createSelectionId();
            this.selectionIds.set(rowIndex, selectionId);
        }
    }

    private resetSelectionIfIdentityChanged(nextIdentityQueryName: string | undefined): void {
        if (
            this.selectionIdentityQueryName !== undefined
            && this.selectionIdentityQueryName !== nextIdentityQueryName
        ) {
            this.selectionResetPending = true;
            void this.selectionManager.clear();
        }
        this.selectionIdentityQueryName = nextIdentityQueryName;
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
                    if (Date.now() < this.suppressClickUntil) {
                        return;
                    }
                    this.showDataPointContextMenu(task, {
                        x: event.clientX,
                        y: event.clientY
                    });
                })
                .on("keydown.gantt", (event: KeyboardEvent, task: GanttTask) => {
                    this.handleDataPointKeydown(event, task);
                })
                .on("focus.gantt-roving", (_event: FocusEvent, task: GanttTask) => {
                    this.setActiveDataPoint(task.rowIndex);
                })
                .on("pointerdown.gantt-touch", (event: PointerEvent, task: GanttTask) => {
                    this.handlePointerDown(event, task);
                })
                .on("pointermove.gantt-touch", (event: PointerEvent) => {
                    this.handlePointerMove(event);
                })
                .on("pointerup.gantt-touch", (event: PointerEvent, task: GanttTask) => {
                    this.handlePointerUp(event, task);
                })
                .on("pointercancel.gantt-touch", () => {
                    this.clearTouchContextTimer();
                });
        }

        if (interactionsAllowed && interaction.enableSelection.value) {
            dataPoints.on("click.gantt", (event: MouseEvent, task: GanttTask) => {
                event.preventDefault();
                event.stopPropagation();
                if (Date.now() < this.suppressClickUntil) {
                    return;
                }
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
                task,
                direction,
                event.key === "Home",
                event.key === "End"
            );
        }
    }

    private moveDataPointFocus(
        currentTask: GanttTask,
        direction: number,
        moveToStart: boolean,
        moveToEnd: boolean
    ): void {
        const tasks = this.parsedData?.tasks ?? [];
        const currentIndex = tasks.findIndex(task => task.rowIndex === currentTask.rowIndex);
        if (currentIndex < 0 || tasks.length === 0) {
            return;
        }

        const targetIndex = moveToStart
            ? 0
            : moveToEnd
                ? tasks.length - 1
                : (currentIndex + direction + tasks.length) % tasks.length;
        const targetTask = tasks[targetIndex];
        if (!targetTask) {
            return;
        }

        this.activeRowIndex = targetTask.rowIndex;
        this.pendingFocusRowIndex = targetTask.rowIndex;
        if (
            this.isVirtualized
            && (targetIndex < this.renderedWindowStart || targetIndex >= this.renderedWindowEnd)
        ) {
            const bodyHeight = Math.max(
                this.virtualRowHeight,
                normalizeViewportDimension(this.lastViewport?.height ?? 0) - 30
            );
            const rowTop = targetIndex * this.virtualRowHeight;
            const rowBottom = rowTop + this.virtualRowHeight;
            if (rowTop < this.scrollBody.scrollTop) {
                this.scrollBody.scrollTop = rowTop;
            } else if (rowBottom > this.scrollBody.scrollTop + bodyHeight) {
                this.scrollBody.scrollTop = Math.max(0, rowBottom - bodyHeight);
            }
            this.renderParsedChart();
            return;
        }

        this.setActiveDataPoint(targetTask.rowIndex);
        this.target.querySelector<SVGGraphicsElement>(
            `.gantt-data-point[data-dp-index="${targetTask.rowIndex}"]`
        )?.focus();
    }

    private setActiveDataPoint(rowIndex: number): void {
        this.activeRowIndex = rowIndex;
        if (this.currentSettings) {
            this.currentSettings.activeRowIndex = rowIndex;
        }
        this.chartContainer.selectAll<SVGGraphicsElement, GanttTask>(".gantt-data-point")
            .attr("tabindex", task => task.rowIndex === rowIndex ? 0 : -1);
    }

    private handlePointerDown(event: PointerEvent, task: GanttTask): void {
        if (event.pointerType !== "touch") {
            return;
        }

        this.clearTouchContextTimer();
        this.touchStart = { x: event.clientX, y: event.clientY };
        this.touchMoved = false;
        this.touchContextTriggered = false;
        this.touchContextTimer = setTimeout(() => {
            this.touchContextTimer = null;
            this.touchContextTriggered = true;
            this.suppressClickUntil = Date.now() + TOUCH_CONTEXT_DELAY_MS;
            this.hideTaskTooltip();
            this.showDataPointContextMenu(task, {
                x: event.clientX,
                y: event.clientY
            });
        }, TOUCH_CONTEXT_DELAY_MS);
    }

    private handlePointerMove(event: PointerEvent): void {
        if (event.pointerType !== "touch" || !this.touchStart) {
            return;
        }

        if (
            Math.abs(event.clientX - this.touchStart.x) > TOUCH_MOVE_TOLERANCE_PX
            || Math.abs(event.clientY - this.touchStart.y) > TOUCH_MOVE_TOLERANCE_PX
        ) {
            this.touchMoved = true;
            this.clearTouchContextTimer();
            this.suppressClickUntil = Date.now() + TOUCH_CONTEXT_DELAY_MS;
        }
    }

    private handlePointerUp(event: PointerEvent, task: GanttTask): void {
        if (event.pointerType !== "touch") {
            return;
        }

        const triggeredContextMenu = this.touchContextTriggered;
        const moved = this.touchMoved;
        this.clearTouchContextTimer();
        if (triggeredContextMenu || moved) {
            this.suppressClickUntil = Date.now() + TOUCH_CONTEXT_DELAY_MS;
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        this.suppressClickUntil = Date.now() + TOUCH_CONTEXT_DELAY_MS;
        if (
            this.formattingSettings.interactionCard.enableTooltips.value
            && this.tooltipService.enabled()
        ) {
            this.showTaskTooltip(task, [event.clientX, event.clientY], true);
        }
        if (this.formattingSettings.interactionCard.enableSelection.value) {
            this.selectTask(task, event.ctrlKey || event.metaKey);
        }
    }

    private clearTouchContextTimer(): void {
        if (this.touchContextTimer !== null) {
            clearTimeout(this.touchContextTimer);
            this.touchContextTimer = null;
        }
        this.touchStart = null;
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
        if (this.destroyed) {
            return;
        }
        const visualSelectionIds = selectionIds.filter(isVisualSelectionId);
        const selectedKeys = new Set(
            visualSelectionIds.map(selectionId => selectionId.getKey())
        );
        const selectedRows = new Set<number>();

        for (const [rowIndex, rowSelectionId] of this.selectionIds) {
            if (selectedKeys.has(rowSelectionId.getKey())) {
                selectedRows.add(rowIndex);
            }
        }

        this.applyDataPointState(selectedRows.size > 0 ? selectedRows : null);
    }

    private applyDataPointState(selectedRows: Set<number> | null): void {
        if (!this.currentSettings) {
            return;
        }

        const highContrast = this.currentSettings.highContrast.isActive;
        const baseOpacity = highContrast ? 1 : this.currentSettings.barOpacity / 100;
        const dimmedOpacity = highContrast ? 0.6 : Math.min(baseOpacity, 0.3);
        const opacityForTask = (task: GanttTask): number => {
            if (selectedRows) {
                return selectedRows.has(task.rowIndex) ? baseOpacity : dimmedOpacity;
            }

            return this.parsedData?.hasHighlights && !task.highlighted
                ? dimmedOpacity
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

    private showTaskTooltip(
        task: GanttTask,
        coordinates: [number, number],
        isTouchEvent: boolean = false
    ): void {
        if (this.touchMoved) {
            return;
        }
        const selectionId = this.selectionIds.get(task.rowIndex);
        this.tooltipService.show({
            dataItems: this.buildTaskTooltip(task),
            identities: selectionId ? [selectionId] : [],
            coordinates,
            isTouchEvent
        });
    }

    private moveTaskTooltip(task: GanttTask, coordinates: [number, number]): void {
        if (this.touchMoved) {
            return;
        }
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
            { displayName: this.getText("Tooltip_Task"), value: task.name }
        ];
        if (task.taskId) {
            items.push({ displayName: this.getText("Tooltip_TaskId"), value: task.taskId });
        }

        if (task.isMilestone) {
            items.push(
                { displayName: this.getText("Tooltip_Date"), value: task.startDateLabel },
                { displayName: this.getText("Tooltip_Duration"), value: task.durationLabel }
            );
        } else {
            items.push(
                { displayName: this.getText("Tooltip_Start"), value: task.startDateLabel },
                { displayName: this.getText("Tooltip_End"), value: task.endDateLabel },
                { displayName: this.getText("Tooltip_Duration"), value: task.durationLabel }
            );
        }

        if (task.progressLabel !== null) {
            items.push({
                displayName: this.getText("Tooltip_Progress"),
                value: task.progressLabel
            });
        }
        if (task.category) {
            items.push({
                displayName: this.getText("Tooltip_Category"),
                value: task.category
            });
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
        const foreground = palette.foreground?.value || "#333333";
        const background = palette.background?.value || "#ffffff";
        const focus = palette.foregroundSelected?.value || foreground;
        this.applyHostColorBoundary(foreground, background, focus, palette.isHighContrast);
        const centerX = width / 2;
        const centerY = height / 2;

        this.scrollBody.style.overflowY = "hidden";
        this.chartContainer.classed("landing", true);
        const hasActiveTaskFilter = this.taskFilterTarget !== null
            && this.crossFilterValues.size > 0;
        const hasInvalidRows = this.parseDiagnostics.invalidRows > 0
            || this.parseDiagnostics.excludedReversedDates > 0;
        const canClearFilter = this.host.hostCapabilities?.allowInteractions !== false
            && hasActiveTaskFilter;
        const heading = hasActiveTaskFilter
            ? this.getText("Landing_NoMatchingTasks")
            : hasInvalidRows
                ? this.getText("Landing_NoValidTasks")
                : this.getText("Visual_Name");
        const guidance = hasActiveTaskFilter
            ? canClearFilter
                ? this.getText("Landing_ClearFilter")
                : this.getText("Landing_ClearFilterPane")
            : hasInvalidRows
                ? this.getText("Landing_ReviewData")
                : this.getText("Landing_AddFields");
        this.svg
            .classed("filter-clearable", canClearFilter)
            .attr("role", canClearFilter ? "button" : "img")
            .attr("tabindex", canClearFilter ? 0 : null)
            .attr("aria-keyshortcuts", canClearFilter ? "Enter Space Escape" : null)
            .attr(
                "aria-label",
                hasActiveTaskFilter
                    ? canClearFilter
                        ? this.getText("Aria_LandingClearFilter")
                        : this.getText("Aria_LandingClearFilterPane")
                    : hasInvalidRows
                        ? this.getText("Aria_LandingNoValidTasks")
                        : this.getText("Aria_LandingAddFields")
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
            .text(heading);
        this.chartContainer.append("text")
            .attr("x", centerX)
            .attr("y", Math.max(28, centerY + 14))
            .attr("text-anchor", "middle")
            .attr("fill", foreground)
            .attr("font-size", "11px")
            .attr("aria-hidden", "true")
            .text(guidance);
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

function findIdentitySource(
    dataView: DataView,
    parsedData: ParsedData | null
): powerbi.DataViewMetadataColumn | undefined {
    const role = parsedData?.taskIdentityMode === "taskId" ? "taskId" : "task";
    return dataView.categorical?.categories?.find(category => category.source.roles?.[role])?.source;
}

function isRtlLocale(locale: string): boolean {
    return /^(ar|fa|he|ps|ur)(?:-|$)/i.test(locale);
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
