import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..");

interface AuditReport {
    metadata?: {
        vulnerabilities?: {
            critical?: number;
            high?: number;
            moderate?: number;
            total?: number;
        };
    };
}

describe("npm certification audit", () => {
    it("exits zero with no critical, high, or moderate advisories", () => {
        const npmCli = process.env.npm_execpath;
        expect(npmCli).toBeTruthy();
        const result = spawnSync(
            process.execPath,
            [npmCli as string, "audit", "--audit-level=moderate", "--json"],
            {
                cwd: repositoryRoot,
                encoding: "utf8"
            }
        );
        const output = result.stdout || result.stderr;
        const report = JSON.parse(output) as AuditReport;
        const vulnerabilities = report.metadata?.vulnerabilities;

        expect(result.status, output).toBe(0);
        expect(vulnerabilities).toMatchObject({
            critical: 0,
            high: 0,
            moderate: 0,
            total: 0
        });
    });
});
