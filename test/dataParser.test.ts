import { describe, it, expect } from "vitest";
import { parseDataView } from "../src/dataParser";
import { buildMockDataView, buildEmptyDataView } from "./helpers/mockDataView";

describe("parseDataView", () => {
    it("parses tasks with start and end dates", () => {
        const dv = buildMockDataView({
            tasks: ["Task A", "Task B"],
            startDates: ["2024-01-01", "2024-02-01"],
            endDates: ["2024-01-31", "2024-03-15"]
        });
        const result = parseDataView(dv)!;
        expect(result).not.toBeNull();
        expect(result.tasks).toHaveLength(2);
        expect(result.tasks[0].name).toBe("Task A");
        expect(result.tasks[0].startDate).toBeInstanceOf(Date);
        expect(result.tasks[0].endDate).toBeInstanceOf(Date);
    });

    it("parses date strings correctly", () => {
        const dv = buildMockDataView({
            tasks: ["Task"],
            startDates: ["2024-06-15"],
            endDates: ["2024-07-20"]
        });
        const result = parseDataView(dv)!;
        expect(result.tasks[0].startDate.getFullYear()).toBe(2024);
        expect(result.tasks[0].startDate.getMonth()).toBe(5); // June = 5
    });

    it("parses numeric timestamps as dates", () => {
        const start = new Date("2024-01-01").getTime();
        const end = new Date("2024-02-01").getTime();
        const dv = buildMockDataView({
            tasks: ["Task"],
            startDates: [start],
            endDates: [end]
        });
        const result = parseDataView(dv)!;
        expect(result.tasks[0].startDate.getTime()).toBe(start);
    });

    it("clamps progress to 0-100 range", () => {
        const dv = buildMockDataView({
            tasks: ["A", "B", "C"],
            startDates: ["2024-01-01", "2024-01-01", "2024-01-01"],
            endDates: ["2024-02-01", "2024-02-01", "2024-02-01"],
            progress: [-20, 50, 150]
        });
        const result = parseDataView(dv)!;
        expect(result.tasks[0].progress).toBe(0);
        expect(result.tasks[1].progress).toBe(50);
        expect(result.tasks[2].progress).toBe(100);
    });

    it("defaults progress to 0 when not provided", () => {
        const dv = buildMockDataView({
            tasks: ["Task"],
            startDates: ["2024-01-01"],
            endDates: ["2024-02-01"]
        });
        const result = parseDataView(dv)!;
        expect(result.tasks[0].progress).toBe(0);
    });

    it("skips tasks with missing start date", () => {
        const dv = buildMockDataView({
            tasks: ["Good", "Bad"],
            startDates: ["2024-01-01", null],
            endDates: ["2024-02-01", "2024-03-01"]
        });
        const result = parseDataView(dv)!;
        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].name).toBe("Good");
    });

    it("skips tasks with missing end date", () => {
        const dv = buildMockDataView({
            tasks: ["Good", "Bad"],
            startDates: ["2024-01-01", "2024-02-01"],
            endDates: ["2024-02-01", null]
        });
        const result = parseDataView(dv)!;
        expect(result.tasks).toHaveLength(1);
    });

    it("skips tasks with invalid date strings", () => {
        const dv = buildMockDataView({
            tasks: ["Good", "Bad"],
            startDates: ["2024-01-01", "not-a-date"],
            endDates: ["2024-02-01", "2024-03-01"]
        });
        const result = parseDataView(dv)!;
        expect(result.tasks).toHaveLength(1);
    });

    it("parses categories correctly", () => {
        const dv = buildMockDataView({
            tasks: ["A", "B", "C"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
            endDates: ["2024-01-31", "2024-02-28", "2024-03-31"],
            categories: ["Phase 1", "Phase 1", "Phase 2"]
        });
        const result = parseDataView(dv)!;
        expect(result.categories).toContain("Phase 1");
        expect(result.categories).toContain("Phase 2");
        expect(result.categories).toHaveLength(2);
    });

    it("parses tooltip measures", () => {
        const dv = buildMockDataView({
            tasks: ["A", "B"],
            startDates: ["2024-01-01", "2024-02-01"],
            endDates: ["2024-01-31", "2024-02-28"],
            tooltipMeasures: [
                { displayName: "Budget", values: [1000, 2000] }
            ]
        });
        const result = parseDataView(dv)!;
        expect(result.tasks[0].tooltipFields).toEqual([
            { displayName: "Budget", value: "1000" }
        ]);
    });

    it("skips null/empty tooltip values but keeps zero", () => {
        const dv = buildMockDataView({
            tasks: ["A", "B", "C"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
            endDates: ["2024-01-31", "2024-02-28", "2024-03-31"],
            tooltipMeasures: [
                { displayName: "KPI", values: [null, 0, ""] }
            ]
        });
        const result = parseDataView(dv)!;
        expect(result.tasks[0].tooltipFields).toEqual([]);
        expect(result.tasks[1].tooltipFields).toEqual([{ displayName: "KPI", value: "0" }]);
        expect(result.tasks[2].tooltipFields).toEqual([]);
    });

    it("computes minDate and maxDate from all tasks", () => {
        const dv = buildMockDataView({
            tasks: ["A", "B"],
            startDates: ["2024-03-01", "2024-01-01"],
            endDates: ["2024-04-01", "2024-06-01"]
        });
        const result = parseDataView(dv)!;
        expect(result.minDate.getTime()).toBe(new Date("2024-01-01").getTime());
        expect(result.maxDate.getTime()).toBe(new Date("2024-06-01").getTime());
    });

    it("returns null for empty DataView", () => {
        expect(parseDataView(buildEmptyDataView())).toBeNull();
    });

    it("returns null for null/undefined input", () => {
        expect(parseDataView(null as any)).toBeNull();
        expect(parseDataView(undefined as any)).toBeNull();
    });

    it("returns null when all dates are invalid", () => {
        const dv = buildMockDataView({
            tasks: ["A", "B"],
            startDates: ["invalid", "nope"],
            endDates: ["bad", "worse"]
        });
        expect(parseDataView(dv)).toBeNull();
    });

    it("preserves rowIndex for selection mapping", () => {
        const dv = buildMockDataView({
            tasks: ["A", "B", "C"],
            startDates: ["2024-01-01", "2024-02-01", "2024-03-01"],
            endDates: ["2024-01-31", "2024-02-28", "2024-03-31"]
        });
        const result = parseDataView(dv)!;
        expect(result.tasks.map(t => t.rowIndex)).toEqual([0, 1, 2]);
    });

    it("handles single task", () => {
        const dv = buildMockDataView({
            tasks: ["Solo"],
            startDates: ["2024-01-01"],
            endDates: ["2024-12-31"]
        });
        const result = parseDataView(dv)!;
        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].name).toBe("Solo");
    });

    it("auto-swaps dates when start > end", () => {
        const dv = buildMockDataView({
            tasks: ["Swapped"],
            startDates: ["2024-06-30"],
            endDates: ["2024-01-15"]
        });
        const result = parseDataView(dv)!;
        expect(result).not.toBeNull();
        expect(result.tasks).toHaveLength(1);
        expect(result.tasks[0].startDate.getTime()).toBeLessThan(result.tasks[0].endDate.getTime());
    });
});
