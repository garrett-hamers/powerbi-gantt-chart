/**
 * Boundary-condition tests for parseDataView() — Gantt chart.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseDataView } from "../src/dataParser";
import { buildMockDataView, buildEmptyDataView } from "./helpers/mockDataView";

describe("parseDataView — boundary conditions (gantt)", () => {
    it("empty DataView returns null, does not throw", () => {
        expect(() => parseDataView(buildEmptyDataView())).not.toThrow();
        expect(parseDataView(buildEmptyDataView())).toBeNull();
    });

    it("null / undefined DataView returns null, does not throw", () => {
        expect(() => parseDataView(null as any)).not.toThrow();
        expect(() => parseDataView(undefined as any)).not.toThrow();
        expect(parseDataView(null as any)).toBeNull();
        expect(parseDataView(undefined as any)).toBeNull();
    });

    it("missing required 'task' role: returns null", () => {
        const dv = buildMockDataView({
            tasks: ["T1"],
            startDates: ["2024-01-01"],
            endDates: ["2024-01-10"]
        });
        // Strip the task role
        (dv.categorical.categories[0].source.roles as any).task = false;
        delete (dv.categorical.categories[0].source.roles as any).task;
        expect(parseDataView(dv)).toBeNull();
    });

    it("missing required 'startDate' role: returns null", () => {
        const dv = buildMockDataView({
            tasks: ["T1"],
            startDates: ["2024-01-01"],
            endDates: ["2024-01-10"]
        });
        dv.categorical.values = dv.categorical.values.filter(
            (v: any) => !v.source.roles?.startDate
        );
        expect(parseDataView(dv)).toBeNull();
    });

    it("missing required 'endDate' role: returns null", () => {
        const dv = buildMockDataView({
            tasks: ["T1"],
            startDates: ["2024-01-01"],
            endDates: ["2024-01-10"]
        });
        dv.categorical.values = dv.categorical.values.filter(
            (v: any) => !v.source.roles?.endDate
        );
        expect(parseDataView(dv)).toBeNull();
    });

    it("extra unknown-role columns ignored without error", () => {
        const dv = buildMockDataView({
            tasks: ["T1"],
            startDates: ["2024-01-01"],
            endDates: ["2024-01-10"]
        });
        dv.categorical.values.push({
            source: { displayName: "Bogus", roles: { bogusRole: true } },
            values: [42]
        });
        const result = parseDataView(dv);
        expect(result).not.toBeNull();
        expect(result!.tasks).toHaveLength(1);
    });

    it("date role receiving numbers: coerced via Date parser", () => {
        const now = Date.UTC(2024, 0, 1);
        const then = Date.UTC(2024, 0, 10);
        const dv = buildMockDataView({
            tasks: ["T1"],
            startDates: [now],
            endDates: [then]
        });
        const result = parseDataView(dv);
        expect(result).not.toBeNull();
        expect(result!.tasks[0].startDate).toBeInstanceOf(Date);
        expect(Number.isNaN(result!.tasks[0].startDate.getTime())).toBe(false);
    });

    it("date role receiving unparseable strings: row skipped (no throw)", () => {
        const dv = buildMockDataView({
            tasks: ["T1", "T2"],
            startDates: ["not-a-date", "2024-01-01"],
            endDates: ["also-not", "2024-01-10"]
        });
        expect(() => parseDataView(dv)).not.toThrow();
        const result = parseDataView(dv);
        // T1 skipped, T2 kept
        expect(result!.tasks).toHaveLength(1);
        expect(result!.tasks[0].name).toBe("T2");
    });

    it("large cardinality (10k rows) parses in <1s", () => {
        const n = 10_000;
        const tasks = Array.from({ length: n }, (_, i) => `T${i}`);
        const baseStart = Date.UTC(2024, 0, 1);
        const dayMs = 86_400_000;
        const startDates = Array.from({ length: n }, (_, i) => baseStart + i * dayMs);
        const endDates = Array.from({ length: n }, (_, i) => baseStart + (i + 1) * dayMs);
        const dv = buildMockDataView({ tasks, startDates, endDates });
        const start = Date.now();
        const result = parseDataView(dv);
        const elapsed = Date.now() - start;
        expect(result).not.toBeNull();
        expect(result!.tasks.length).toBe(n);
        expect(elapsed).toBeLessThan(1000);
    });

    it("mixed null values (task/startDate/endDate/progress) don't produce NaN", () => {
        const dv = buildMockDataView({
            tasks: ["T1", null as any, "T3"],
            startDates: ["2024-01-01", null, "2024-03-01"],
            endDates: ["2024-01-10", "2024-02-10", null],
            progress: [50, null, null]
        });
        expect(() => parseDataView(dv)).not.toThrow();
        const result = parseDataView(dv);
        if (result) {
            for (const t of result.tasks) {
                expect(Number.isNaN(t.startDate.getTime())).toBe(false);
                expect(Number.isNaN(t.endDate.getTime())).toBe(false);
                expect(Number.isNaN(t.progress)).toBe(false);
            }
        }
    });

    it("date-typed category (startDate as real Date objects)", () => {
        const dv = buildMockDataView({
            tasks: ["T1"],
            startDates: [new Date("2024-01-01") as any],
            endDates: [new Date("2024-01-10") as any]
        });
        const result = parseDataView(dv);
        expect(result).not.toBeNull();
        expect(result!.tasks[0].startDate).toBeInstanceOf(Date);
    });

    it("highlight array mismatch handled gracefully", () => {
        const dv = buildMockDataView({
            tasks: ["T1", "T2"],
            startDates: ["2024-01-01", "2024-02-01"],
            endDates: ["2024-01-10", "2024-02-10"]
        });
        (dv.categorical.values[0] as any).highlights = [1];
        expect(() => parseDataView(dv)).not.toThrow();
        (dv.categorical.values[0] as any).highlights = [1, 2, 3, 4];
        expect(() => parseDataView(dv)).not.toThrow();
    });

    it("duplicate task values kept deterministically", () => {
        const dv = buildMockDataView({
            tasks: ["A", "A", "B"],
            startDates: ["2024-01-01", "2024-01-05", "2024-02-01"],
            endDates: ["2024-01-10", "2024-01-15", "2024-02-10"]
        });
        const result = parseDataView(dv);
        expect(result!.tasks.map(t => t.name)).toEqual(["A", "A", "B"]);
    });

    it("loads many-rows.json fixture without throwing", () => {
        const fixturePath = path.resolve(__dirname, "../e2e/fixtures/many-rows.json");
        const dv = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
        expect(() => parseDataView(dv)).not.toThrow();
        const result = parseDataView(dv);
        expect(result).not.toBeNull();
    });
});
