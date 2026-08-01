import powerbi from "powerbi-visuals-api";

import ILocalizationManager = powerbi.extensibility.ILocalizationManager;

const DEFAULT_STRINGS: Record<string, string> = {
    Format_ChartSettings: "Chart Settings",
    Format_ShowTodayLine: "Show Today Line",
    Format_ShowGridLines: "Show Grid Lines",
    Format_BarHeight: "Bar Height",
    Format_BarCornerRadius: "Bar Corner Radius",
    Format_Title: "Title",
    Format_ShowTitle: "Show Title",
    Format_TitleText: "Title Text",
    Format_TitlePlaceholder: "Chart title",
    Format_FontSize: "Font Size",
    Format_FontColor: "Font Color",
    Format_Alignment: "Alignment",
    Format_AlignLeft: "Left",
    Format_AlignCenter: "Center",
    Format_AlignRight: "Right",
    Format_DataLabels: "Data Labels",
    Format_ShowLabels: "Show Labels",
    Format_ShowProgress: "Show Progress %",
    Format_Categories: "Categories",
    Format_ShowCategories: "Show Categories",
    Format_Legend: "Legend",
    Format_ShowLegend: "Show Legend",
    Format_Design: "Design",
    Format_CategoryColor: "Category Color {0}",
    Format_ProgressColor: "Progress Color",
    Format_TodayLineColor: "Today Line Color",
    Format_BarOpacity: "Bar Opacity (%)",
    Format_Interaction: "Interaction",
    Format_EnableSelection: "Enable Selection",
    Format_EnableTooltips: "Enable Tooltips",
    Format_CrossFilterMode: "Cross-Filter Mode",
    Format_Highlight: "Highlight",
    Format_Filter: "Filter",
    Format_ProgressInterpretation: "Progress values",
    Format_ProgressAuto: "Auto",
    Format_ProgressFraction: "Fraction (0 to 1)",
    Format_ProgressPercent: "Percent (0 to 100)",
    Format_ReversedDates: "Reversed dates",
    Format_ReversedCorrect: "Correct and warn",
    Format_ReversedExclude: "Exclude and warn",
    Visual_Name: "Atlyn Gantt Chart",
    Chart_Task: "task",
    Chart_Tasks: "tasks",
    Landing_AddFields: "Add Task, Start Date, and End Date fields",
    Landing_NoValidTasks: "No valid tasks to display",
    Landing_NoMatchingTasks: "No tasks match the current filter",
    Landing_ClearFilter: "Select this message or press Enter to clear the task filter",
    Landing_ClearFilterPane: "Clear the task filter in the Filters pane",
    Landing_ReviewData: "Review task names and start/end dates",
    Tooltip_Task: "Task",
    Tooltip_TaskId: "Task ID",
    Tooltip_Date: "Date",
    Tooltip_Start: "Start",
    Tooltip_End: "End",
    Tooltip_Duration: "Duration",
    Tooltip_Progress: "Progress",
    Tooltip_Category: "Category",
    Duration_Milestone: "Milestone",
    Warning_DataQualityTitle: "Review Gantt data quality",
    Warning_AmbiguousProgress:
        "Progress values are between 0 and 1 but have no percentage format. "
        + "Auto preserves 0 to 100 behavior; choose Fraction (0 to 1) to scale them.",
    Warning_ReversedCorrected: "{0} reversed date row(s) were corrected for compatibility.",
    Warning_ReversedExcluded: "{0} reversed date row(s) were excluded.",
    Warning_InvalidRows: "{0} row(s) were excluded because required values were blank or invalid.",
    Warning_DuplicateTaskIds:
        "{0} duplicate Task ID value(s) were found. "
        + "Task identity is used as a safe fallback; dependency support is not provided.",
    Warning_BlankTaskIds: "Blank Task ID values were found. Task identity is used as a safe fallback.",
    Warning_DataSegment: "Power BI supplied a reduced data segment; only the supplied rows are rendered (maximum {0}).",
    Warning_DataReductionLimit: "Categorical data is capped at {0} rows. This visual does not claim full-model support.",
    Aria_ChartTasks: "Gantt chart with {0} {1}",
    Aria_MilestoneOn: "milestone on {0}",
    Aria_TaskRange: "{0} to {1}, {2}",
    Aria_Progress: "progress {0}",
    Aria_Category: "category {0}",
    Aria_LandingAddFields: "Atlyn Gantt Chart. Add Task, Start Date, and End Date fields.",
    Aria_LandingNoValidTasks: "Atlyn Gantt Chart has no valid tasks. Review task names and dates.",
    Aria_LandingClearFilter:
        "Atlyn Gantt Chart has no matching tasks. Activate to clear the task filter.",
    Aria_LandingClearFilterPane:
        "Atlyn Gantt Chart has no matching tasks. Clear the task filter in the Filters pane."
};

export function createTextGetter(
    localizationManager: ILocalizationManager | undefined
): (key: string, ...values: Array<string | number>) => string {
    return (key: string, ...values: Array<string | number>): string => {
        const localized = localizationManager?.getDisplayName(key);
        const template = localized && localized !== key
            ? localized
            : DEFAULT_STRINGS[key] ?? key;
        return values.reduce<string>(
            (result, value, index) => result.replaceAll(`{${index}}`, String(value)),
            template
        );
    };
}
