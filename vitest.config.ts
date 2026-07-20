import { defineConfig } from "vitest/config";

const optimizedPowerBiDependencies = [
    "powerbi-visuals-utils-formattingutils",
    "powerbi-visuals-utils-typeutils",
    "powerbi-visuals-utils-dataviewutils"
];

export default defineConfig({
    test: {
        clearMocks: true,
        deps: {
            optimizer: {
                ssr: {
                    enabled: true,
                    include: optimizedPowerBiDependencies
                },
                client: {
                    enabled: true,
                    include: optimizedPowerBiDependencies
                }
            }
        },
        server: {
            deps: {
                inline: [/^powerbi-visuals-utils-/]
            }
        }
    }
});
