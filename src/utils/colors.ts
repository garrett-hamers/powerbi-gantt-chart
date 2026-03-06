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
    categoryColors: [
        "#2196F3", "#FF9800", "#4CAF50", "#9C27B0", "#F44336",
        "#00BCD4", "#795548", "#607D8B", "#E91E63", "#009688"
    ],
    progressColor: "#1565C0",
    todayLineColor: "#E53935",
    barOpacity: 0.8
};

export function getCategoryColor(index: number, colors: string[]): string {
    return colors[index % colors.length];
}

/** Parse a hex color (#RRGGBB or #RGB) into [r, g, b] */
function parseHex(hex: string): [number, number, number] {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}

/** Relative luminance (0 = black, 1 = white) per WCAG */
export function getLuminance(hex: string): number {
    const [r, g, b] = parseHex(hex).map(c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Returns "#333333" for light backgrounds, "#ffffff" for dark backgrounds */
export function getContrastTextColor(bgHex: string): string {
    return getLuminance(bgHex) > 0.4 ? "#333333" : "#ffffff";
}

/** Darken a hex color by a factor (0 = unchanged, 1 = black) */
export function darkenColor(hex: string, amount: number): string {
    const [r, g, b] = parseHex(hex);
    const f = 1 - amount;
    const dr = Math.round(r * f);
    const dg = Math.round(g * f);
    const db = Math.round(b * f);
    return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
}
