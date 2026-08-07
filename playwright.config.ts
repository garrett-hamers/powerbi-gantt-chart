import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./test",
    testMatch: "**/*.playwright.ts",
    timeout: 30000,
    use: {
        browserName: "chromium",
        headless: true,
        viewport: { width: 960, height: 600 },
    },
    webServer: {
        command: "npx http-server . -p 9322 -c-1 --silent",
        port: 9322,
        reuseExistingServer: false,
    },
});
