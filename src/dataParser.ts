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

export interface TooltipField {
    displayName: string;
    value: string;
}

export interface GanttTask {
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

export function parseDataView(dataView: DataView | null | undefined, locale: string = "en-US"): ParsedData | null {
    const categorical = dataView?.categorical;
    if (!categorical?.categories?.length || !categorical.values) {
        return null;
    }

    let taskColumn: DataViewCategoryColumn | undefined;
    let categoryColumn: DataViewCategoryColumn | undefined;

    for (const column of categorical.categories) {
        if (column.source.roles?.task) {
            taskColumn = column;
        }
        if (column.source.roles?.category) {
            categoryColumn = column;
        }
    }

    if (!taskColumn?.values.length) {
        return null;
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
        return null;
    }

    const highlightColumns = [startDateColumn, endDateColumn, progressColumn]
        .filter((column): column is DataViewValueColumn => column !== undefined);
    const hasHighlights = highlightColumns.some(column => column.highlights !== undefined);
    const progressScale = progressColumn?.source.format?.includes("%") ? 100 : 1;

    const tasks: GanttTask[] = [];
    const categories = new Set<string>();
    let minDate: Date | undefined;
    let maxDate: Date | undefined;

    for (let rowIndex = 0; rowIndex < taskColumn.values.length; rowIndex++) {
        const rawTask = taskColumn.values[rowIndex];
        const filterValue = toFilterValue(rawTask);
        if (filterValue === null || rawTask === null || rawTask === undefined) {
            continue;
        }

        const taskName = truncateText(formatValue(rawTask, taskColumn.source.format, locale).trim());
        if (!taskName) {
            continue;
        }

        const parsedStart = parseDate(startDateColumn.values[rowIndex]);
        const parsedEnd = parseDate(endDateColumn.values[rowIndex]);
        if (!parsedStart || !parsedEnd) {
            continue;
        }

        const datesAreReversed = parsedStart.getTime() > parsedEnd.getTime();
        const actualStart = datesAreReversed ? parsedEnd : parsedStart;
        const actualEnd = datesAreReversed ? parsedStart : parsedEnd;
        const startFormat = datesAreReversed ? endDateColumn.source.format : startDateColumn.source.format;
        const endFormat = datesAreReversed ? startDateColumn.source.format : endDateColumn.source.format;

        const progress = normalizeProgress(
            progressColumn?.values[rowIndex],
            progressScale
        );
        const category = formatCategory(categoryColumn, rowIndex, locale);
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
            name: taskName,
            filterValue,
            startDate: actualStart,
            endDate: actualEnd,
            startDateLabel: formatDate(actualStart, startFormat, locale),
            endDateLabel: formatDate(actualEnd, endFormat, locale),
            durationDays,
            durationLabel: formatDuration(durationDays, locale),
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
        return null;
    }

    return {
        tasks,
        categories: Array.from(categories),
        minDate,
        maxDate,
        hasHighlights,
        taskQueryName: taskColumn.source.queryName
    };
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
