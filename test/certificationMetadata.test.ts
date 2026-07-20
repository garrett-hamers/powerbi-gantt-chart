import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = join(import.meta.dirname, "..");

interface PackageManifest {
    version: string;
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
}

interface PackageLock {
    packages: Record<string, { version?: string }>;
}

interface VisualManifest {
    apiVersion: string;
    externalJS: unknown[];
    visual: {
        guid: string;
        version: string;
        gitHubUrl: string;
    };
    version: string;
}

describe("Power BI certification metadata", () => {
    it("locks the required API, tools, version, and audited package command", () => {
        const packageManifest = readJson<PackageManifest>("package.json");
        const packageLock = readJson<PackageLock>("package-lock.json");
        const visualManifest = readJson<VisualManifest>("pbiviz.json");

        expect(packageManifest.version).toBe("1.0.1.0");
        expect(packageManifest.dependencies["powerbi-visuals-api"]).toBe("5.11.0");
        expect(packageManifest.devDependencies["powerbi-visuals-tools"]).toBe("7.1.2");
        expect(packageManifest.scripts.eslint).toBe("npx eslint . --ext .js,.jsx,.ts,.tsx");
        expect(packageManifest.scripts.package).toBe("pbiviz package --certification-audit");
        expect(packageLock.packages["node_modules/powerbi-visuals-api"]?.version).toBe("5.11.0");
        expect(packageLock.packages["node_modules/powerbi-visuals-tools"]?.version).toBe("7.1.2");
        expect(visualManifest.apiVersion).toBe("5.11.0");
        expect(visualManifest.visual.version).toBe("1.0.1.0");
        expect(visualManifest.version).toBe("1.0.1.0");
        expect(visualManifest.visual.guid).toBe("ganttChartATLYN7F3A9D2B5E1C8046");
        expect(visualManifest.externalJS).toEqual([]);
        expect(visualManifest.visual.gitHubUrl)
            .toBe("https://github.com/garrett-hamers/powerbi-gantt-chart");
    });

    it("keeps privileges empty and all generated directories ignored", () => {
        const capabilities = readJson<{
            supportsLandingPage: boolean;
            supportsEmptyDataView: boolean;
            privileges: unknown[];
        }>("capabilities.json");
        const gitignore = readText(".gitignore").split(/\r?\n/);

        expect(capabilities.supportsLandingPage).toBe(true);
        expect(capabilities.supportsEmptyDataView).toBe(true);
        expect(capabilities.privileges).toEqual([]);
        expect(gitignore).toEqual(expect.arrayContaining([
            "node_modules/",
            ".tmp/",
            "dist/",
            "test-results/",
            "playwright-report/"
        ]));
    });

    it("uses the published Power BI ESLint configuration exactly", () => {
        const eslintConfig = readText("eslint.config.mjs").replace(/\r\n/g, "\n");
        expect(eslintConfig).toBe(
            "import powerbiVisualsConfigs from \"eslint-plugin-powerbi-visuals\";\n"
            + "\n"
            + "export default [\n"
            + "    powerbiVisualsConfigs.configs.recommended,\n"
            + "    {\n"
            + "        ignores: [\"node_modules/**\", \"dist/**\", \".vscode/**\", \".tmp/**\"],\n"
            + "    },\n"
            + "];\n"
        );
    });

    it("tracks source only, with no generated directories or JavaScript bundles", () => {
        const trackedFiles = execFileSync("git", ["ls-files"], {
            cwd: repositoryRoot,
            encoding: "utf8"
        }).trim().split(/\r?\n/);

        expect(trackedFiles).not.toContain("");
        expect(trackedFiles.some(path =>
            /^(?:node_modules|\.tmp|dist|test-results)\//.test(path)
        )).toBe(false);
        expect(trackedFiles.some(path => path.endsWith(".js"))).toBe(false);
    });

    it("contains no forbidden runtime API in visual source", () => {
        const source = readSourceFiles(join(repositoryRoot, "src"));
        const forbiddenPatterns = [
            /\bfetch\s*\(/,
            /\bXMLHttpRequest\b/,
            /\bWebSocket\b/,
            /\.innerHTML\b/,
            /\beval\s*\(/,
            /\bFunction\s*\(/,
            /\bdocument\.write\b/,
            /\bset(?:Timeout|Interval)\s*\(\s*["'`]/
        ];

        for (const pattern of forbiddenPatterns) {
            expect(source).not.toMatch(pattern);
        }
    });
});

function readJson<T>(relativePath: string): T {
    return JSON.parse(readText(relativePath)) as T;
}

function readText(relativePath: string): string {
    return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

function readSourceFiles(directory: string): string {
    return readdirSync(directory, { withFileTypes: true })
        .flatMap(entry => {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                return readSourceFiles(path);
            }
            return entry.name.endsWith(".ts") ? readFileSync(path, "utf8") : "";
        })
        .join("\n");
}
