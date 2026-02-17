/**
 * Color utilities for Gantt chart
 */

export interface GanttColors {
    categoryColors: string[];
    progressColor: string;
    todayLineColor: string;
    barOpacity: number;
}

export const DEFAULT_GANTT_COLORS: GanttColors = {
    categoryColors: ["#2196F3", "#FF9800", "#4CAF50", "#9C27B0", "#F44336"],
    progressColor: "#1565C0",
    todayLineColor: "#E53935",
    barOpacity: 0.8
};

export function getCategoryColor(index: number, colors: string[]): string {
    return colors[index % colors.length];
}
