import { describe, expect, it } from "vitest";
import { parseDataView } from "../src/dataParser";
import { buildEmptyDataView, buildMockDataView } from "./helpers/mockDataView";

describe("parseDataView", () => {
    it("parses tasks and preserves row indexes for selection identities", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["Task A", "Task B"],
            startDates: ["2024-01-01", "2024-02-01"],
            endDates: ["2024-01-31", "2024-03-15"]
        }));

        expect(result?.tasks).toHaveLength(2);
        expect(result?.tasks[0]?.name).toBe("Task A");
        expect(result?.tasks.map(task => task.rowIndex)).toEqual([0, 1]);
        expect(result?.tasks[0]?.filterValue).toBe("Task A");
    });

    it("parses date-only strings as local calendar dates", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["Task"],
            startDates: ["2024-06-15"],
            endDates: ["2024-07-20"]
        }));

        expect(result?.tasks[0]?.startDate.getFullYear()).toBe(2024);
        expect(result?.tasks[0]?.startDate.getMonth()).toBe(5);
        expect(result?.tasks[0]?.startDate.getDate()).toBe(15);
        expect(result?.tasks[0]?.startDate.getHours()).toBe(0);
    });

    it("parses finite numeric timestamps and Date objects", () => {
        const start = new Date(2024, 0, 1);
        const end = new Date(2024, 1, 1);
        const result = parseDataView(buildMockDataView({
            tasks: ["Task"],
            startDates: [start.getTime()],
            endDates: [end]
        }));

        expect(result?.tasks[0]?.startDate.getTime()).toBe(start.getTime());
        expect(result?.tasks[0]?.endDate.getTime()).toBe(end.getTime());
        expect(result?.tasks[0]?.endDate).not.toBe(end);
    });

    it("auto-swaps reversed dates and computes a positive duration", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["Swapped"],
            startDates: ["2024-06-30"],
            endDates: ["2024-01-15"]
        }));

        expect(result?.tasks[0]?.startDate.getTime())
            .toBeLessThan(result?.tasks[0]?.endDate.getTime() ?? 0);
        expect(result?.tasks[0]?.durationDays).toBe(167);
        expect(result?.tasks[0]?.durationLabel).toBe("167 days");
    });

    it("detects zero-duration tasks as milestones", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["Release"],
            startDates: ["2024-04-15"],
            endDates: ["2024-04-15"]
        }));

        expect(result?.tasks[0]?.isMilestone).toBe(true);
        expect(result?.tasks[0]?.durationDays).toBe(0);
        expect(result?.tasks[0]?.durationLabel).toBe("Milestone");
    });

    it("clamps progress and preserves non-finite values as unavailable", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["Low", "Mid", "High", "Invalid"],
            startDates: ["2024-01-01", "2024-01-01", "2024-01-01", "2024-01-01"],
            endDates: ["2024-02-01", "2024-02-01", "2024-02-01", "2024-02-01"],
            progress: [-20, 50, 150, Number.POSITIVE_INFINITY]
        }));

        expect(result?.tasks.map(task => task.progress)).toEqual([0, 50, 100, null]);
    });

    it("uses one percentage scale for the entire formatted column", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["Half", "Complete", "Over", "Large"],
            startDates: ["2024-01-01", "2024-01-01", "2024-01-01", "2024-01-01"],
            endDates: ["2024-02-01", "2024-02-01", "2024-02-01", "2024-02-01"],
            progress: [0.625, 1, 1.01, 50],
            formats: { progress: "0.0%" }
        }), "en-US");

        expect(result?.tasks.map(task => task.progress)).toEqual([62.5, 100, 100, 100]);
        expect(result?.tasks[0]?.progressLabel).toBe("62.5%");
        expect(result?.tasks[1]?.progressLabel).toBe("100.0%");
        expect(result?.tasks[2]?.progressLabel).toBe("100.0%");
    });

    it("distinguishes unavailable progress from explicit zero", () => {
        const missing = parseDataView(buildMockDataView({
            tasks: ["Task"],
            startDates: ["2024-01-01"],
            endDates: ["2024-02-01"]
        }));
        const optionalValues = parseDataView(buildMockDataView({
            tasks: ["Null", "Blank", "Invalid", "Zero"],
            startDates: ["2024-01-01", "2024-01-01", "2024-01-01", "2024-01-01"],
            endDates: ["2024-02-01", "2024-02-01", "2024-02-01", "2024-02-01"],
            progress: [null, "", "not-a-number", 0]
        }));

        expect(missing?.tasks[0]?.progress).toBeNull();
        expect(missing?.tasks[0]?.progressLabel).toBeNull();
        expect(optionalValues?.tasks.map(task => task.progress)).toEqual([null, null, null, 0]);
        expect(optionalValues?.tasks.map(task => task.progressLabel)).toEqual([null, null, null, "0%"]);
    });

    it("rejects nonnumeric progress types instead of coercing them", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["False", "True", "Date", "Whitespace", "Numeric string", "Exponent"],
            startDates: Array.from({ length: 6 }, () => "2024-01-01"),
            endDates: Array.from({ length: 6 }, () => "2024-02-01"),
            progress: [false, true, new Date(2024, 0, 1), "   ", "50", "1e2"]
        }));

        expect(result?.tasks.map(task => task.progress))
            .toEqual([null, null, null, null, 50, 100]);
    });

    it("skips rows with blank tasks or missing and invalid dates", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["Good", "", "Missing Start", "Missing End", "Invalid"],
            startDates: ["2024-01-01", "2024-01-01", null, "2024-01-01", "2024-02-30"],
            endDates: ["2024-02-01", "2024-02-01", "2024-02-01", null, "2024-03-01"]
        }));

        expect(result?.tasks.map(task => task.name)).toEqual(["Good"]);
    });

    it("rejects infinite, boolean, and out-of-range dates without throwing", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["Infinite", "Boolean", "Too Early", "Good"],
            startDates: [Number.POSITIVE_INFINITY, true, "0000-01-01", "2024-01-01"],
            endDates: ["2024-01-01", "2024-01-01", "2024-01-02", "2024-01-02"]
        }));

        expect(result?.tasks.map(task => task.name)).toEqual(["Good"]);
    });

    it("accepts supported ISO datetimes with local, UTC, and offset semantics", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["Local", "UTC", "Offset"],
            startDates: [
                "2024-02-29T12:30:45.123",
                "2024-02-29T12:30:45Z",
                "2024-02-29T12:30:45+05:30"
            ],
            endDates: [
                "2024-02-29T13:30:45.123",
                "2024-02-29T13:30:45Z",
                "2024-02-29T13:30:45+05:30"
            ]
        }));

        expect(result?.tasks).toHaveLength(3);
        expect(result?.tasks.every(task => task.durationLabel === "1 hour")).toBe(true);
    });

    it("rejects impossible and non-ISO datetime strings", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["February 30", "Non-leap day", "Loose", "Bad time", "Bad offset", "Good"],
            startDates: [
                "2024-02-30T10:00:00Z",
                "2023-02-29T10:00:00Z",
                "02/20/2024 10:00",
                "2024-02-20T24:01:00Z",
                "2024-02-20T10:00:00+14:30",
                "2024-02-20T10:00:00Z"
            ],
            endDates: [
                "2024-03-01T10:00:00Z",
                "2023-03-01T10:00:00Z",
                "2024-02-20T11:00:00Z",
                "2024-02-20T23:00:00Z",
                "2024-02-20T11:00:00+14:30",
                "2024-02-20T11:00:00Z"
            ]
        }));

        expect(result?.tasks.map(task => task.name)).toEqual(["Good"]);
    });

    it("formats sub-day durations without rounding to zero days", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["Hours", "Minutes", "Seconds"],
            startDates: [
                "2024-01-01T00:00:00",
                "2024-01-01T00:00:00",
                "2024-01-01T00:00:00"
            ],
            endDates: [
                "2024-01-01T06:00:00",
                "2024-01-01T00:30:00",
                "2024-01-01T00:00:30"
            ]
        }));

        expect(result?.tasks.map(task => task.durationLabel))
            .toEqual(["6 hours", "30 minutes", "< 1 minute"]);
    });

    it("deduplicates formatted category labels", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["A", "B", "C"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
            endDates: ["2024-01-31", "2024-02-28", "2024-03-31"],
            categories: ["Phase 1", "Phase 1", "Phase 2"]
        }));

        expect(result?.categories).toEqual(["Phase 1", "Phase 2"]);
    });

    it("applies source format strings to tooltip values", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["A"],
            startDates: ["2024-01-01"],
            endDates: ["2024-01-31"],
            tooltipMeasures: [
                { displayName: "Budget", values: [1234], format: "$#,0" },
                { displayName: "Risk", values: ["Low"] }
            ]
        }), "en-US");

        expect(result?.tasks[0]?.tooltipFields).toEqual([
            { displayName: "Budget", value: "$1,234" },
            { displayName: "Risk", value: "Low" }
        ]);
    });

    it("omits blank tooltip values but keeps zero and false", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["A", "B", "C", "D"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"],
            endDates: ["2024-01-31", "2024-02-28", "2024-03-31", "2024-04-30"],
            tooltipMeasures: [
                { displayName: "KPI", values: [null, 0, "", false] }
            ]
        }));

        expect(result?.tasks[0]?.tooltipFields).toEqual([]);
        expect(result?.tasks[1]?.tooltipFields[0]?.value).toBe("0");
        expect(result?.tasks[2]?.tooltipFields).toEqual([]);
        expect(result?.tasks[3]?.tooltipFields[0]?.value).toBe("False");
    });

    it("computes the date extent across valid rows", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["A", "B"],
            startDates: ["2024-03-01", "2024-01-01"],
            endDates: ["2024-04-01", "2024-06-01"]
        }));

        expect(result?.minDate).toEqual(new Date(2024, 0, 1));
        expect(result?.maxDate).toEqual(new Date(2024, 5, 1));
    });

    it("marks rows from incoming cross-highlights", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["Dimmed", "Highlighted"],
            startDates: ["2024-01-01", "2024-02-01"],
            endDates: ["2024-01-31", "2024-02-28"],
            highlights: {
                startDates: [null, "2024-02-01"],
                endDates: [null, "2024-02-28"]
            }
        }));

        expect(result?.hasHighlights).toBe(true);
        expect(result?.tasks.map(task => task.highlighted)).toEqual([false, true]);
    });

    it("dims every row when an active cross-highlight has no matches", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["A", "B"],
            startDates: ["2024-01-01", "2024-02-01"],
            endDates: ["2024-01-31", "2024-02-28"],
            highlights: {
                startDates: [null, null]
            }
        }));

        expect(result?.hasHighlights).toBe(true);
        expect(result?.tasks.map(task => task.highlighted)).toEqual([false, false]);
    });

    it("bounds extreme user text before it reaches the DOM", () => {
        const result = parseDataView(buildMockDataView({
            tasks: ["x".repeat(1_000)],
            startDates: ["2024-01-01"],
            endDates: ["2024-02-01"]
        }));

        expect(result?.tasks[0]?.name).toHaveLength(512);
        expect(result?.tasks[0]?.name.endsWith("\u2026")).toBe(true);
    });

    it("returns null for empty, missing, and wholly invalid data views", () => {
        expect(parseDataView(buildEmptyDataView())).toBeNull();
        expect(parseDataView(null)).toBeNull();
        expect(parseDataView(undefined)).toBeNull();
        expect(parseDataView(buildMockDataView({
            tasks: ["A", "B"],
            startDates: ["invalid", "nope"],
            endDates: ["bad", "worse"]
        }))).toBeNull();
    });
});
