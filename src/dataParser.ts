/**
 * Data Parser — Parses Power BI DataView into tasks for the Gantt chart
 */
import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;

export interface TooltipField {
    displayName: string;
    value: string;
}

export interface GanttTask {
    name: string;
    startDate: Date;
    endDate: Date;
    progress: number;
    category: string;
    tooltipFields: TooltipField[];
    rowIndex: number;
    isHighlighted: boolean;
    highlightStartDate?: Date;
    highlightEndDate?: Date;
    highlightProgress?: number;
    highlightTooltipFields?: TooltipField[];
}

export interface ParsedData {
    tasks: GanttTask[];
    categories: string[];
    minDate: Date;
    maxDate: Date;
    hasHighlights: boolean;
    invalidDateRows: number;
}

export function parseDataView(dataView: DataView): ParsedData | null {
    if (!dataView?.categorical?.categories || dataView.categorical.categories.length < 1 || !dataView.categorical.values) {
        return null;
    }

    const categorical = dataView.categorical;
    const allCategories = categorical.categories;
    const values = categorical.values;

    // Find task and category columns by role
    let taskValues: powerbi.PrimitiveValue[] = [];
    let categoryValues: powerbi.PrimitiveValue[] = [];

    for (const cat of allCategories) {
        const role = cat.source.roles;
        if (role) {
            if (role["task"]) taskValues = cat.values;
            if (role["category"]) categoryValues = cat.values;
        }
    }

    if (taskValues.length === 0) {
        return null;
    }

    // Find value columns by role
    let startDateValues: powerbi.PrimitiveValue[] = [];
    let endDateValues: powerbi.PrimitiveValue[] = [];
    let progressValues: powerbi.PrimitiveValue[] = [];
    let startDateHighlights: powerbi.PrimitiveValue[] | undefined;
    let endDateHighlights: powerbi.PrimitiveValue[] | undefined;
    let progressHighlights: powerbi.PrimitiveValue[] | undefined;
    const tooltipColumns: Array<{
        displayName: string;
        values: powerbi.PrimitiveValue[];
        highlights?: powerbi.PrimitiveValue[];
    }> = [];

    for (const valueColumn of values) {
        const roles = valueColumn.source.roles;
        if (roles) {
            if (roles["startDate"]) {
                startDateValues = valueColumn.values;
                startDateHighlights = (valueColumn as any).highlights;
            }
            if (roles["endDate"]) {
                endDateValues = valueColumn.values;
                endDateHighlights = (valueColumn as any).highlights;
            }
            if (roles["progress"]) {
                progressValues = valueColumn.values;
                progressHighlights = (valueColumn as any).highlights;
            }
            if (roles["tooltips"]) {
                tooltipColumns.push({
                    displayName: valueColumn.source.displayName || "Tooltip",
                    values: valueColumn.values,
                    highlights: (valueColumn as any).highlights
                });
            }
        }
    }

    if (startDateValues.length === 0 || endDateValues.length === 0) {
        return null;
    }

    const tasks: GanttTask[] = [];
    const categorySet = new Set<string>();
    let minDate: Date | null = null;
    let maxDate: Date | null = null;
    let invalidDateRows = 0;

    const highlightColumns = [
        startDateHighlights,
        endDateHighlights,
        progressHighlights,
        ...tooltipColumns.map(column => column.highlights)
    ].filter((column): column is powerbi.PrimitiveValue[] => Array.isArray(column));
    const hasHighlights = highlightColumns.some(column => column.some(value => value !== null && value !== undefined));

    for (let i = 0; i < taskValues.length; i++) {
        const taskName = String(taskValues[i] ?? "");
        if (!taskName) continue;

        const startRaw = startDateValues[i];
        const endRaw = endDateValues[i];

        const startDate = parseDate(startRaw);
        const endDate = parseDate(endRaw);

        if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            invalidDateRows++;
            continue;
        }

        // Auto-swap if dates are reversed
        const [actualStart, actualEnd] = startDate > endDate ? [endDate, startDate] : [startDate, endDate];

        // Clamp progress to 0-100
        let progress = 0;
        if (progressValues.length > i && progressValues[i] != null) {
            progress = Number(progressValues[i]) || 0;
            progress = Math.max(0, Math.min(100, progress));
        }

        const highlightStart = startDateHighlights && startDateHighlights[i] != null
            ? parseDate(startDateHighlights[i])
            : undefined;
        const highlightEnd = endDateHighlights && endDateHighlights[i] != null
            ? parseDate(endDateHighlights[i])
            : undefined;
        const [actualHighlightStart, actualHighlightEnd] = highlightStart && highlightEnd && highlightStart > highlightEnd
            ? [highlightEnd, highlightStart]
            : [highlightStart, highlightEnd];
        const highlightProgress = progressHighlights && progressHighlights[i] != null
            ? Math.max(0, Math.min(100, Number(progressHighlights[i]) || 0))
            : undefined;

        const category = categoryValues.length > i ? String(categoryValues[i] ?? "") : "";
        if (category) categorySet.add(category);

        const tooltipFields = tooltipColumns
            .map((column) => {
                const rawValue = column.values[i];
                if (rawValue == null || rawValue === "") return null;
                return { displayName: column.displayName, value: String(rawValue) };
            })
            .filter((field): field is TooltipField => field !== null);
        const highlightTooltipFields = tooltipColumns
            .map((column) => {
                const rawValue = column.highlights?.[i];
                if (rawValue == null || rawValue === "") return null;
                return { displayName: column.displayName, value: String(rawValue) };
            })
            .filter((field): field is TooltipField => field !== null);
        const isHighlighted = hasHighlights
            ? highlightColumns.some(column => column.length > i && column[i] !== null && column[i] !== undefined)
            : false;

        tasks.push({
            name: taskName,
            startDate: actualStart,
            endDate: actualEnd,
            progress,
            category,
            tooltipFields,
            rowIndex: i,
            isHighlighted,
            highlightStartDate: actualHighlightStart && !isNaN(actualHighlightStart.getTime()) ? actualHighlightStart : undefined,
            highlightEndDate: actualHighlightEnd && !isNaN(actualHighlightEnd.getTime()) ? actualHighlightEnd : undefined,
            highlightProgress,
            highlightTooltipFields
        });

        if (!minDate || actualStart < minDate) minDate = actualStart;
        if (!maxDate || actualEnd > maxDate) maxDate = actualEnd;
    }

    if (tasks.length === 0 || !minDate || !maxDate) {
        return null;
    }

    return {
        tasks,
        categories: Array.from(categorySet),
        minDate,
        maxDate,
        hasHighlights,
        invalidDateRows
    };
}

function parseDate(value: powerbi.PrimitiveValue): Date | null {
    if (value == null) return null;
    if (value instanceof Date) return value;
    const d = new Date(value as any);
    if (isNaN(d.getTime())) return null;
    return d;
}
