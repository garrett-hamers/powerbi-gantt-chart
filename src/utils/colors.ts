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
    const fallbackColor = DEFAULT_GANTT_COLORS.categoryColors[0] ?? "#2196F3";
    if (colors.length === 0) {
        return fallbackColor;
    }

    const normalizedIndex = ((index % colors.length) + colors.length) % colors.length;
    return colors[normalizedIndex] || fallbackColor;
}

function parseHex(value: string): [number, number, number] | null {
    const shortMatch = /^#([\da-f])([\da-f])([\da-f])$/i.exec(value);
    if (shortMatch) {
        const red = shortMatch[1] ?? "0";
        const green = shortMatch[2] ?? "0";
        const blue = shortMatch[3] ?? "0";
        return [
            Number.parseInt(`${red}${red}`, 16),
            Number.parseInt(`${green}${green}`, 16),
            Number.parseInt(`${blue}${blue}`, 16)
        ];
    }

    const longMatch = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
    if (!longMatch) {
        return null;
    }

    return [
        Number.parseInt(longMatch[1] ?? "00", 16),
        Number.parseInt(longMatch[2] ?? "00", 16),
        Number.parseInt(longMatch[3] ?? "00", 16)
    ];
}

export function getLuminance(hex: string): number {
    const rgb = parseHex(hex);
    if (!rgb) {
        return 1;
    }

    const linearize = (component: number): number => {
        const s = component / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const [red, green, blue] = rgb;
    const r = linearize(red);
    const g = linearize(green);
    const b = linearize(blue);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastTextColor(bgHex: string): string {
    return getLuminance(bgHex) > 0.4 ? "#333333" : "#ffffff";
}
