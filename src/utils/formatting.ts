import powerbi from "powerbi-visuals-api";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";

const DAY_IN_MILLISECONDS = 86_400_000;
const MAX_DISPLAY_TEXT_LENGTH = 512;

export function clampNumber(value: number, minimum: number, maximum: number, fallback: number): number {
    if (!Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(maximum, Math.max(minimum, value));
}

export function truncateText(text: string, maxLength: number = MAX_DISPLAY_TEXT_LENGTH): string {
    if (text.length <= maxLength) {
        return text;
    }

    return `${text.slice(0, Math.max(0, maxLength - 1))}\u2026`;
}

export function formatValue(
    value: powerbi.PrimitiveValue | Date,
    format: string | undefined,
    locale: string
): string {
    return truncateText(valueFormatter.format(value, format, true, locale));
}

export function formatDate(value: Date, format: string | undefined, locale: string): string {
    return formatValue(value, format || valueFormatter.DefaultDateFormat, locale);
}

export function formatProgress(progress: number, format: string | undefined, locale: string): string {
    const usesPercentFormat = format?.includes("%") ?? false;
    const formatted = valueFormatter.format(
        usesPercentFormat ? progress / 100 : progress,
        format || "0.##",
        true,
        locale
    );

    return usesPercentFormat ? formatted : `${formatted}%`;
}

export function calculateDurationDays(startDate: Date, endDate: Date): number {
    const startsAtMidnight = startDate.getHours() === 0
        && startDate.getMinutes() === 0
        && startDate.getSeconds() === 0
        && startDate.getMilliseconds() === 0;
    const endsAtMidnight = endDate.getHours() === 0
        && endDate.getMinutes() === 0
        && endDate.getSeconds() === 0
        && endDate.getMilliseconds() === 0;

    if (startsAtMidnight && endsAtMidnight) {
        const startUtc = getUtcCalendarDate(startDate);
        const endUtc = getUtcCalendarDate(endDate);
        return (endUtc - startUtc) / DAY_IN_MILLISECONDS;
    }

    return (endDate.getTime() - startDate.getTime()) / DAY_IN_MILLISECONDS;
}

export function formatDuration(durationDays: number, locale: string): string {
    if (durationDays >= 1) {
        return formatDurationUnit(durationDays, "day", locale);
    }

    const durationHours = durationDays * 24;
    if (durationHours >= 1) {
        return formatDurationUnit(durationHours, "hour", locale);
    }

    const durationMinutes = durationHours * 60;
    if (durationMinutes >= 1) {
        return formatDurationUnit(durationMinutes, "minute", locale);
    }

    return "< 1 minute";
}

export function sanitizeInstanceId(instanceId: string): string {
    const sanitized = instanceId.replace(/[^A-Za-z0-9_-]/g, "_");
    return `gantt-${sanitized || "visual"}`;
}

function getUtcCalendarDate(value: Date): number {
    const utcDate = new Date(0);
    utcDate.setUTCFullYear(value.getFullYear(), value.getMonth(), value.getDate());
    utcDate.setUTCHours(0, 0, 0, 0);
    return utcDate.getTime();
}

function formatDurationUnit(value: number, unit: "day" | "hour" | "minute", locale: string): string {
    const formatter = new Intl.NumberFormat(locale, {
        style: "unit",
        unit,
        unitDisplay: "long",
        maximumFractionDigits: Number.isInteger(value) ? 0 : 2
    });
    return formatter.format(value);
}
