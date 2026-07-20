import type powerbi from "powerbi-visuals-api";

export interface MockDataInput {
    tasks: powerbi.PrimitiveValue[];
    startDates: powerbi.PrimitiveValue[];
    endDates: powerbi.PrimitiveValue[];
    progress?: powerbi.PrimitiveValue[];
    categories?: powerbi.PrimitiveValue[];
    formats?: {
        task?: string;
        startDate?: string;
        endDate?: string;
        progress?: string;
    };
    highlights?: {
        startDates?: powerbi.PrimitiveValue[];
        endDates?: powerbi.PrimitiveValue[];
        progress?: powerbi.PrimitiveValue[];
    };
    tooltipMeasures?: Array<{
        displayName: string;
        values: powerbi.PrimitiveValue[];
        format?: string;
    }>;
    objects?: powerbi.DataViewObjects;
    taskQueryName?: string;
    taskExpression?: powerbi.data.ISQExpr;
    taskFieldParameterExpression?: powerbi.data.ISQExpr;
}

export function buildMockDataView(input: MockDataInput): powerbi.DataView {
    const taskColumn = {
        source: {
            displayName: "Task",
            queryName: input.taskQueryName || "Table.Task",
            type: { text: true },
            roles: { task: true },
            format: input.formats?.task,
            expr: input.taskExpression,
            sourceFieldParameters: input.taskFieldParameterExpression
                ? [{
                    displayName: "Selected task field",
                    expr: input.taskFieldParameterExpression
                }]
                : undefined
        },
        values: input.tasks
    } as powerbi.DataViewCategoryColumn;

    const categoryColumns: powerbi.DataViewCategoryColumn[] = [taskColumn];
    if (input.categories) {
        categoryColumns.push({
            source: {
                displayName: "Category",
                queryName: "Table.Category",
                type: { text: true },
                roles: { category: true }
            },
            values: input.categories
        } as powerbi.DataViewCategoryColumn);
    }

    const valueColumns: powerbi.DataViewValueColumn[] = [
        {
            source: {
                displayName: "Start Date",
                queryName: "Table.StartDate",
                type: { dateTime: true },
                roles: { startDate: true },
                format: input.formats?.startDate
            },
            values: input.startDates,
            highlights: input.highlights?.startDates
        },
        {
            source: {
                displayName: "End Date",
                queryName: "Table.EndDate",
                type: { dateTime: true },
                roles: { endDate: true },
                format: input.formats?.endDate
            },
            values: input.endDates,
            highlights: input.highlights?.endDates
        }
    ];

    if (input.progress) {
        valueColumns.push({
            source: {
                displayName: "Progress",
                queryName: "Table.Progress",
                type: { numeric: true },
                roles: { progress: true },
                format: input.formats?.progress
            },
            values: input.progress,
            highlights: input.highlights?.progress
        });
    }

    input.tooltipMeasures?.forEach((measure, index) => {
        valueColumns.push({
            source: {
                displayName: measure.displayName,
                queryName: `Table.Tooltip${index + 1}`,
                roles: { tooltips: true },
                format: measure.format
            },
            values: measure.values
        });
    });

    const columns = categoryColumns
        .map(column => column.source)
        .concat(valueColumns.map(column => column.source));

    return {
        categorical: {
            categories: categoryColumns,
            values: valueColumns as powerbi.DataViewValueColumns
        },
        metadata: {
            columns,
            objects: input.objects
        }
    };
}

export function buildEmptyDataView(): powerbi.DataView {
    return {
        categorical: {
            categories: [],
            values: [] as unknown as powerbi.DataViewValueColumns
        },
        metadata: { columns: [] }
    };
}
