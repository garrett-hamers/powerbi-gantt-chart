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
    progress: number;
    progressLabel: string;
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
            progressColumn?.source.format
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
            progressLabel: formatProgress(progress, progressColumn?.source.format, locale),
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

function normalizeProgress(value: powerbi.PrimitiveValue | undefined, format: string | undefined): number {
    if (value === null || value === undefined || value === "") {
        return 0;
    }

    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    const normalizedValue = format?.includes("%") && Math.abs(numericValue) <= 1
        ? numericValue * 100
        : numericValue;
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
    let parsed: Date;

    if (value instanceof Date) {
        parsed = new Date(value.getTime());
    } else if (typeof value === "number" && Number.isFinite(value)) {
        parsed = new Date(value);
    } else if (typeof value === "string") {
        const text = value.trim();
        if (!text) {
            return null;
        }

        const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
        if (dateOnly) {
            const year = Number(dateOnly[1]);
            const month = Number(dateOnly[2]);
            const day = Number(dateOnly[3]);
            parsed = new Date(0);
            parsed.setFullYear(year, month - 1, day);
            parsed.setHours(0, 0, 0, 0);
            if (
                parsed.getFullYear() !== year
                || parsed.getMonth() !== month - 1
                || parsed.getDate() !== day
            ) {
                return null;
            }
        } else {
            parsed = new Date(text);
        }
    } else {
        return null;
    }

    const year = parsed.getFullYear();
    if (!Number.isFinite(parsed.getTime()) || year < 1 || year > 9999) {
        return null;
    }

    return parsed;
}
