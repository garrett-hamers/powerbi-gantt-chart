import powerbi from "powerbi-visuals-api";
import {
    calculateDurationDays,
    formatDate,
    formatDuration,
    formatProgress,
    formatValue,
    truncateText
} from "./utils/formatting";

import DataView = powerbi.DataView;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewValueColumn = powerbi.DataViewValueColumn;

export type TaskFilterValue = string | number | boolean;
export type ProgressInterpretation = "auto" | "fraction" | "percent";
export type ReversedDateHandling = "correct" | "exclude";

export interface ParseOptions {
    progressInterpretation?: ProgressInterpretation;
    reversedDateHandling?: ReversedDateHandling;
    milestoneLabel?: string;
}

export interface ParseDiagnostics {
    ambiguousProgress: boolean;
    correctedReversedDates: number;
    excludedReversedDates: number;
    invalidRows: number;
    duplicateTaskIds: number;
}

export interface ParseResult {
    data: ParsedData | null;
    diagnostics: ParseDiagnostics;
}

export interface TooltipField {
    displayName: string;
    value: string;
}

export interface GanttTask {
    taskId: string | null;
    name: string;
    filterValue: TaskFilterValue;
    startDate: Date;
    endDate: Date;
    startDateLabel: string;
    endDateLabel: string;
    durationDays: number;
    durationLabel: string;
    isMilestone: boolean;
    progress: number | null;
    progressLabel: string | null;
    category: string;
    tooltipFields: TooltipField[];
    rowIndex: number;
    highlighted: boolean;
}

export interface ParsedData {
    tasks: GanttTask[];
    categories: string[];
    minDate: Date;
    maxDate: Date;
    hasHighlights: boolean;
    taskQueryName: string | undefined;
}

export function parseDataView(
    dataView: DataView | null | undefined,
    locale: string = "en-US",
    options: ParseOptions = {}
): ParsedData | null {
    return parseDataViewWithDiagnostics(dataView, locale, options).data;
}

export function parseDataViewWithDiagnostics(
    dataView: DataView | null | undefined,
    locale: string = "en-US",
    options: ParseOptions = {}
): ParseResult {
    const diagnostics: ParseDiagnostics = {
        ambiguousProgress: false,
        correctedReversedDates: 0,
        excludedReversedDates: 0,
        invalidRows: 0,
        duplicateTaskIds: 0
    };
    const categorical = dataView?.categorical;
    if (!categorical?.categories?.length || !categorical.values) {
        return { data: null, diagnostics };
    }

    let taskColumn: DataViewCategoryColumn | undefined;
    let categoryColumn: DataViewCategoryColumn | undefined;
    let taskIdColumn: DataViewCategoryColumn | undefined;

    for (const column of categorical.categories) {
        if (column.source.roles?.task) {
            taskColumn = column;
        }
        if (column.source.roles?.category) {
            categoryColumn = column;
        }
        if (column.source.roles?.taskId) {
            taskIdColumn = column;
        }
    }

    if (!taskColumn?.values.length) {
        return { data: null, diagnostics };
    }

    let startDateColumn: DataViewValueColumn | undefined;
    let endDateColumn: DataViewValueColumn | undefined;
    let progressColumn: DataViewValueColumn | undefined;
    const tooltipColumns: DataViewValueColumn[] = [];

    for (const column of categorical.values) {
        if (column.source.roles?.startDate) {
            startDateColumn = column;
        }
        if (column.source.roles?.endDate) {
            endDateColumn = column;
        }
        if (column.source.roles?.progress) {
            progressColumn = column;
        }
        if (column.source.roles?.tooltips) {
            tooltipColumns.push(column);
        }
    }

    if (!startDateColumn?.values.length || !endDateColumn?.values.length) {
        return { data: null, diagnostics };
    }

    const highlightColumns = [startDateColumn, endDateColumn, progressColumn]
        .filter((column): column is DataViewValueColumn => column !== undefined);
    const hasHighlights = highlightColumns.some(column => column.highlights !== undefined);
    const progressInterpretation = options.progressInterpretation ?? "auto";
    const progressScale = getProgressScale(progressColumn, progressInterpretation);
    diagnostics.ambiguousProgress = progressInterpretation === "auto"
        && isProgressScaleAmbiguous(progressColumn);
    const reversedDateHandling = options.reversedDateHandling ?? "correct";

    const tasks: GanttTask[] = [];
    const categories = new Set<string>();
    const taskIds = new Set<string>();
    let minDate: Date | undefined;
    let maxDate: Date | undefined;

    for (let rowIndex = 0; rowIndex < taskColumn.values.length; rowIndex++) {
        const rawTask = taskColumn.values[rowIndex];
        const filterValue = toFilterValue(rawTask);
        if (filterValue === null || rawTask === null || rawTask === undefined) {
            diagnostics.invalidRows++;
            continue;
        }

        const taskName = truncateText(formatValue(rawTask, taskColumn.source.format, locale).trim());
        if (!taskName) {
            diagnostics.invalidRows++;
            continue;
        }

        const parsedStart = parseDate(startDateColumn.values[rowIndex]);
        const parsedEnd = parseDate(endDateColumn.values[rowIndex]);
        if (!parsedStart || !parsedEnd) {
            diagnostics.invalidRows++;
            continue;
        }

        const datesAreReversed = parsedStart.getTime() > parsedEnd.getTime();
        if (datesAreReversed && reversedDateHandling === "exclude") {
            diagnostics.excludedReversedDates++;
            continue;
        }
        if (datesAreReversed) {
            diagnostics.correctedReversedDates++;
        }
        const actualStart = datesAreReversed ? parsedEnd : parsedStart;
        const actualEnd = datesAreReversed ? parsedStart : parsedEnd;
        const startFormat = datesAreReversed ? endDateColumn.source.format : startDateColumn.source.format;
        const endFormat = datesAreReversed ? startDateColumn.source.format : endDateColumn.source.format;

        const progress = normalizeProgress(
            progressColumn?.values[rowIndex],
            progressScale
        );
        const category = formatCategory(categoryColumn, rowIndex, locale);
        const rawTaskId = taskIdColumn?.values[rowIndex];
        const taskId = formatTaskId(rawTaskId, taskIdColumn, locale);
        const taskIdKey = canonicalTaskId(rawTaskId);
        if (taskIdKey) {
            if (taskIds.has(taskIdKey)) {
                diagnostics.duplicateTaskIds++;
            } else {
                taskIds.add(taskIdKey);
            }
        }
        if (category) {
            categories.add(category);
        }

        const durationDays = calculateDurationDays(actualStart, actualEnd);
        const tooltipFields = tooltipColumns.flatMap(column => {
            const value = column.values[rowIndex];
            if (value === null || value === undefined || value === "") {
                return [];
            }

            return [{
                displayName: truncateText(column.source.displayName || "Tooltip"),
                value: formatValue(value, column.source.format, locale)
            }];
        });
        const highlighted = !hasHighlights || highlightColumns.some(
            column => column.highlights?.[rowIndex] !== null
                && column.highlights?.[rowIndex] !== undefined
        );

        tasks.push({
            taskId,
            name: taskName,
            filterValue,
            startDate: actualStart,
            endDate: actualEnd,
            startDateLabel: formatDate(actualStart, startFormat, locale),
            endDateLabel: formatDate(actualEnd, endFormat, locale),
            durationDays,
            durationLabel: durationDays === 0
                ? options.milestoneLabel ?? "Milestone"
                : formatDuration(durationDays, locale),
            isMilestone: actualStart.getTime() === actualEnd.getTime(),
            progress,
            progressLabel: progress === null
                ? null
                : formatProgress(progress, progressColumn?.source.format, locale),
            category,
            tooltipFields,
            rowIndex,
            highlighted
        });

        if (!minDate || actualStart.getTime() < minDate.getTime()) {
            minDate = actualStart;
        }
        if (!maxDate || actualEnd.getTime() > maxDate.getTime()) {
            maxDate = actualEnd;
        }
    }

    if (tasks.length === 0 || !minDate || !maxDate) {
        return { data: null, diagnostics };
    }

    return {
        data: {
            tasks,
            categories: Array.from(categories),
            minDate,
            maxDate,
            hasHighlights,
            taskQueryName: taskColumn.source.queryName
        },
        diagnostics
    };
}

function formatTaskId(
    value: powerbi.PrimitiveValue | undefined,
    taskIdColumn: DataViewCategoryColumn | undefined,
    locale: string
): string | null {
    if (!taskIdColumn) {
        return null;
    }

    if (value === null || value === undefined || value === "") {
        return null;
    }

    const taskId = truncateText(formatValue(value, taskIdColumn.source.format, locale).trim());
    return taskId || null;
}

function canonicalTaskId(value: powerbi.PrimitiveValue | undefined): string | null {
    if (typeof value === "string") {
        const normalized = value.trim();
        return normalized ? `string:${normalized}` : null;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? `number:${value}` : null;
    }
    if (typeof value === "boolean") {
        return `boolean:${value}`;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return `date:${value.toISOString()}`;
    }
    return null;
}

function formatCategory(
    categoryColumn: DataViewCategoryColumn | undefined,
    rowIndex: number,
    locale: string
): string {
    if (!categoryColumn) {
        return "";
    }

    const value = categoryColumn.values[rowIndex];
    if (value === null || value === undefined || value === "") {
        return "";
    }

    return truncateText(formatValue(value, categoryColumn.source.format, locale).trim());
}

function getProgressScale(
    progressColumn: DataViewValueColumn | undefined,
    interpretation: ProgressInterpretation
): number {
    if (interpretation === "fraction") {
        return 100;
    }
    if (interpretation === "percent") {
        return 1;
    }
    return progressColumn?.source.format?.includes("%") ? 100 : 1;
}

function isProgressScaleAmbiguous(progressColumn: DataViewValueColumn | undefined): boolean {
    if (!progressColumn || progressColumn.source.format?.includes("%")) {
        return false;
    }

    const numericValues = progressColumn.values
        .map(toFiniteProgressNumber)
        .filter((value): value is number => value !== null);
    return numericValues.length > 0
        && numericValues.some(value => value > 0)
        && numericValues.every(value => value >= 0 && value <= 1);
}

function toFiniteProgressNumber(value: powerbi.PrimitiveValue | undefined): number | null {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== "string") {
        return null;
    }

    const text = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
        return null;
    }
    const numericValue = Number(text);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function normalizeProgress(value: powerbi.PrimitiveValue | undefined, scale: number): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    let numericValue: number;
    if (typeof value === "number") {
        numericValue = value;
    } else if (typeof value === "string") {
        const text = value.trim();
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
            return null;
        }
        numericValue = Number(text);
    } else {
        return null;
    }

    if (!Number.isFinite(numericValue)) {
        return null;
    }

    const normalizedValue = numericValue * scale;
    return Math.min(100, Math.max(0, normalizedValue));
}

function toFilterValue(value: powerbi.PrimitiveValue | undefined): TaskFilterValue | null {
    if (typeof value === "string" || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (value instanceof Date && Number.isFinite(value.getTime())) {
        return value.toISOString();
    }

    return null;
}

function parseDate(value: powerbi.PrimitiveValue | undefined): Date | null {
    if (value instanceof Date) {
        return isSupportedDate(value) ? new Date(value.getTime()) : null;
    }

    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            return null;
        }
        const parsed = new Date(value);
        return isSupportedDate(parsed) ? parsed : null;
    }

    if (typeof value !== "string") {
        return null;
    }

    const text = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(text);
    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidCalendarDate(year, month, day)) {
        return null;
    }

    if (match[4] === undefined) {
        const parsed = new Date(0);
        parsed.setFullYear(year, month - 1, day);
        parsed.setHours(0, 0, 0, 0);
        return parsed;
    }

    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = match[6] === undefined ? 0 : Number(match[6]);
    const millisecond = Number((match[7] || "").slice(0, 3).padEnd(3, "0"));
    if (hour > 23 || minute > 59 || second > 59) {
        return null;
    }

    const timezone = match[8];
    if (!timezone) {
        const parsed = new Date(0);
        parsed.setFullYear(year, month - 1, day);
        parsed.setHours(hour, minute, second, millisecond);
        return parsed.getFullYear() === year
            && parsed.getMonth() === month - 1
            && parsed.getDate() === day
            && parsed.getHours() === hour
            && parsed.getMinutes() === minute
            && parsed.getSeconds() === second
            && parsed.getMilliseconds() === millisecond
            ? parsed
            : null;
    }

    const timezoneOffset = parseTimezoneOffset(timezone);
    if (timezoneOffset === null) {
        return null;
    }

    const utcDate = new Date(0);
    utcDate.setUTCFullYear(year, month - 1, day);
    utcDate.setUTCHours(hour, minute, second, millisecond);
    const parsed = new Date(utcDate.getTime() - timezoneOffset);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function isSupportedDate(value: Date): boolean {
    if (!Number.isFinite(value.getTime())) {
        return false;
    }

    const year = value.getFullYear();
    return year >= 1 && year <= 9999;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
    if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) {
        return false;
    }

    const daysInMonth = [
        31,
        isLeapYear(year) ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31
    ];
    return day <= (daysInMonth[month - 1] ?? 0);
}

function isLeapYear(year: number): boolean {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function parseTimezoneOffset(timezone: string): number | null {
    if (timezone === "Z") {
        return 0;
    }

    const match = /^([+-])(\d{2}):(\d{2})$/.exec(timezone);
    if (!match) {
        return null;
    }

    const hours = Number(match[2]);
    const minutes = Number(match[3]);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) {
        return null;
    }

    const offset = (hours * 60 + minutes) * 60_000;
    return match[1] === "+" ? offset : -offset;
}
