import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";

export default [
    powerbiVisualsConfigs.configs.recommended,
    {
        ignores: [
            "node_modules/**",
            "dist/**",
            ".vscode/**",
            ".tmp/**",
            "test-results/**",
            "**/visual-harness-bundle.js",
        ],
    },
    {
        files: ["test/**", "e2e/**", "scripts/**"],
        rules: {
            "powerbi-visuals/insecure-random": "off",
            "powerbi-visuals/no-banned-terms": "off",
            "powerbi-visuals/no-http-string": "off",
            "powerbi-visuals/no-inner-outer-html": "off",
            "powerbi-visuals/non-literal-fs-path": "off",
        },
    },
];
