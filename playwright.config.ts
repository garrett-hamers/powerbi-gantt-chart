import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./test",
    testMatch: "**/*.playwright.ts",
    snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{-snapshotSuffix}{ext}",
    timeout: 30000,
    use: {
        headless: true,
        viewport: { width: 960, height: 600 },
    },
    projects: [
        {
            name: "chromium-regression",
            testMatch: "**/gantt.playwright.ts",
            use: { browserName: "chromium" },
        },
        {
            name: "online-chrome-proxy",
            testMatch: "**/gantt.cross-browser.playwright.ts",
            use: { browserName: "chromium" },
        },
        {
            name: "edge-anaheim",
            testMatch: "**/gantt.cross-browser.playwright.ts",
            use: { browserName: "chromium", channel: "msedge" },
        },
        {
            name: "online-safari-proxy",
            testMatch: "**/gantt.cross-browser.playwright.ts",
            use: { browserName: "webkit" },
        },
    ],
    webServer: {
        command: "npx http-server . -p 9322 -c-1 --silent",
        port: 9322,
        reuseExistingServer: false,
    },
});
