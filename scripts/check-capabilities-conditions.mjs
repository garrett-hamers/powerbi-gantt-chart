/**
 * Guard against the capabilities.json defect that failed Atlyn Gantt, Radar and
 * Tornado certification in July 2026.
 *
 * Microsoft's documented rule for dataViewMappings conditions is:
 *
 *   "Only one data role can have a minimum value of >= 1 per condition."
 *   -- https://learn.microsoft.com/en-us/power-bi/developer/visuals/dataview-mappings#conditions
 *
 * Violating it makes Power BI's field-well drop validator unable to find a
 * satisfiable condition for any partially-filled state, so the wells silently
 * reject every drop and the visual can never receive data.
 *
 * Usage:  node scripts/check-capabilities-conditions.mjs [...paths to capabilities.json]
 * Exits non-zero on violation, so it can run in CI or a pretest hook.
 */
import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

const files = argv.slice(2);
if (files.length === 0) {
    console.error("usage: node check-capabilities-conditions.mjs <capabilities.json...>");
    exit(2);
}

let failures = 0;

for (const file of files) {
    const before = failures;
    let caps;
    try {
        caps = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
        console.error(`✗ ${file}: unreadable (${err.message})`);
        failures++;
        continue;
    }

    const mappings = caps.dataViewMappings ?? [];
    const declaredRoles = new Set((caps.dataRoles ?? []).map((r) => r.name));

    mappings.forEach((mapping, mIndex) => {
        const conditions = mapping.conditions ?? [];
        conditions.forEach((condition, cIndex) => {
            const where = `${file} [mapping ${mIndex}, condition ${cIndex}]`;

            // Rule 1 (the certification blocker): at most one role may require min >= 1.
            const required = Object.entries(condition)
                .filter(([, v]) => typeof v?.min === "number" && v.min >= 1)
                .map(([k]) => k);

            if (required.length > 1) {
                console.error(
                    `✗ ${where}: ${required.length} roles declare min >= 1 ` +
                    `(${required.join(", ")}). Power BI allows at most one. ` +
                    `Field wells will reject every drop.`
                );
                failures++;
            }

            // Rule 2: a condition must not reference an undeclared role.
            for (const role of Object.keys(condition)) {
                if (!declaredRoles.has(role)) {
                    console.error(`✗ ${where}: condition references undeclared role "${role}".`);
                    failures++;
                }
            }

            // Rule 3 (advisory): min > max is unsatisfiable.
            for (const [role, v] of Object.entries(condition)) {
                if (typeof v?.min === "number" && typeof v?.max === "number" && v.min > v.max) {
                    console.error(`✗ ${where}: role "${role}" has min ${v.min} > max ${v.max}.`);
                    failures++;
                }
            }
        });
    });

    if (failures === before) {
        console.log(`✓ ${file}`);
    }
}

if (failures > 0) {
    console.error(`\n${failures} violation(s) found.`);
    exit(1);
}
console.log("\nAll capabilities conditions are valid.");
