/**
 * Formatting utilities for numbers and labels
 */

export type NumberScale = "none" | "thousands" | "millions" | "billions" | "auto";

export interface FormatOptions {
    scale: NumberScale;
    decimals: number;
    prefix: string;
    suffix: string;
    showSign: boolean;
    negativeFormat: "minus" | "parentheses";
}

const DEFAULT_FORMAT: FormatOptions = {
    scale: "auto",
    decimals: 1,
    prefix: "",
    suffix: "",
    showSign: false,
    negativeFormat: "minus"
};

export function formatNumber(value: number, options: Partial<FormatOptions> = {}): string {
    const opts = { ...DEFAULT_FORMAT, ...options };
    let scaledValue = value;
    let scaleSuffix = "";
    const absValue = Math.abs(value);

    if (opts.scale === "auto") {
        if (absValue >= 1_000_000_000) { scaledValue = value / 1_000_000_000; scaleSuffix = "B"; }
        else if (absValue >= 1_000_000) { scaledValue = value / 1_000_000; scaleSuffix = "M"; }
        else if (absValue >= 1_000) { scaledValue = value / 1_000; scaleSuffix = "K"; }
    } else if (opts.scale === "thousands") { scaledValue = value / 1_000; scaleSuffix = "K"; }
    else if (opts.scale === "millions") { scaledValue = value / 1_000_000; scaleSuffix = "M"; }
    else if (opts.scale === "billions") { scaledValue = value / 1_000_000_000; scaleSuffix = "B"; }

    let formatted = scaledValue.toFixed(opts.decimals);
    if (opts.decimals > 0) {
        formatted = parseFloat(formatted).toString();
        if (formatted.includes('.')) {
            const parts = formatted.split('.');
            formatted = parts[0] + '.' + parts[1].padEnd(opts.decimals, '0').slice(0, opts.decimals);
        }
    }

    if (opts.showSign && value > 0) formatted = "+" + formatted;
    if (opts.negativeFormat === "parentheses" && value < 0) {
        formatted = formatted.replace("-", "");
        return `${opts.prefix}(${formatted}${scaleSuffix})${opts.suffix}`;
    }
    return `${opts.prefix}${formatted}${scaleSuffix}${opts.suffix}`;
}

export function formatPercent(value: number, decimals: number = 1, showSign: boolean = true): string {
    const sign = showSign && value > 0 ? "+" : "";
    return `${sign}${value.toFixed(decimals)}%`;
}

export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + "…";
}
