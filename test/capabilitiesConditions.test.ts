import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..");

interface RoleRange {
    min?: number;
    max?: number;
}

interface Capabilities {
    dataRoles: Array<{ name: string; kind: string }>;
    dataViewMappings: Array<{ conditions?: Array<Record<string, RoleRange>> }>;
}

function readCapabilities(): Capabilities {
    return JSON.parse(
        readFileSync(join(repositoryRoot, "capabilities.json"), "utf8")
    ) as Capabilities;
}

/**
 * Regression guard for the defect that failed AppSource certification in July 2026.
 *
 * Power BI allows at most ONE data role with `min >= 1` per condition:
 * https://learn.microsoft.com/en-us/power-bi/developer/visuals/dataview-mappings#conditions
 *
 * With several required roles, every intermediate field-well state is invalid, so
 * the host silently rejects every drag-and-drop and the visual can never receive
 * data. The reviewer's video was titled "Visual fields do not accept values".
 *
 * Requiredness belongs in the landing page, which this visual already implements.
 */
describe("capabilities dataViewMappings conditions", () => {
    it("never requires more than one data role per condition", () => {
        const capabilities = readCapabilities();

        for (const mapping of capabilities.dataViewMappings) {
            for (const condition of mapping.conditions ?? []) {
                const required = Object.entries(condition)
                    .filter(([, range]) => (range.min ?? 0) >= 1)
                    .map(([role]) => role);

                expect(
                    required.length,
                    `Condition requires ${required.length} roles (${required.join(", ")}). `
                    + "Power BI permits at most one; field wells reject every drop otherwise."
                ).toBeLessThanOrEqual(1);
            }
        }
    });

    it("only references declared data roles and uses satisfiable ranges", () => {
        const capabilities = readCapabilities();
        const declared = new Set(capabilities.dataRoles.map((role) => role.name));

        for (const mapping of capabilities.dataViewMappings) {
            for (const condition of mapping.conditions ?? []) {
                for (const [role, range] of Object.entries(condition)) {
                    expect(declared, `condition references undeclared role "${role}"`)
                        .toContain(role);
                    if (typeof range.min === "number" && typeof range.max === "number") {
                        expect(range.min, `role "${role}" has min > max`)
                            .toBeLessThanOrEqual(range.max);
                    }
                }
            }
        }
    });
});

