import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    testMatch: /.*\.playwright\.spec\.ts/,
    timeout: 30000,
    fullyParallel: false,
    reporter: "list",
    use: {
        browserName: "chromium",
        headless: true,
        viewport: { width: 1400, height: 900 },
    },
});
