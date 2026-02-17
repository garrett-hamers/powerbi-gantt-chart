/**
 * Mock DataView builder for Gantt chart tests.
 */
export interface MockDataInput {
    tasks: string[];
    startDates: Array<string | number | Date | null>;
    endDates: Array<string | number | Date | null>;
    progress?: Array<number | null>;
    categories?: string[];
    tooltipMeasures?: Array<{
        displayName: string;
        values: Array<string | number | boolean | null | undefined>;
    }>;
}

export function buildMockDataView(input: MockDataInput): any {
    const taskColumn = {
        source: {
            displayName: "Task",
            queryName: "Table.Task",
            type: { text: true },
            roles: { task: true }
        },
        values: input.tasks
    };

    const allCategories: any[] = [taskColumn];

    if (input.categories) {
        allCategories.push({
            source: {
                displayName: "Category",
                queryName: "Table.Category",
                type: { text: true },
                roles: { category: true }
            },
            values: input.categories
        });
    }

    const valueColumns: any[] = [];

    valueColumns.push({
        source: {
            displayName: "Start Date",
            queryName: "Table.StartDate",
            roles: { startDate: true }
        },
        values: input.startDates
    });

    valueColumns.push({
        source: {
            displayName: "End Date",
            queryName: "Table.EndDate",
            roles: { endDate: true }
        },
        values: input.endDates
    });

    if (input.progress) {
        valueColumns.push({
            source: {
                displayName: "Progress",
                queryName: "Table.Progress",
                roles: { progress: true }
            },
            values: input.progress
        });
    }

    if (input.tooltipMeasures) {
        input.tooltipMeasures.forEach((measure, index) => {
            valueColumns.push({
                source: {
                    displayName: measure.displayName,
                    queryName: `Table.Tooltip${index + 1}`,
                    roles: { tooltips: true }
                },
                values: measure.values
            });
        });
    }

    const columns = allCategories.map(c => c.source).concat(valueColumns.map(v => v.source));

    return {
        categorical: {
            categories: allCategories,
            values: valueColumns
        },
        metadata: { columns }
    };
}

export function buildEmptyDataView(): any {
    return {
        categorical: {
            categories: [],
            values: []
        },
        metadata: { columns: [] }
    };
}
