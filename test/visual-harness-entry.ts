import type powerbi from "powerbi-visuals-api";
import { Visual } from "../src/visual";
import { buildMockDataView, MockDataInput } from "./helpers/mockDataView";

import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

const scenarios: Record<string, MockDataInput> = {
    standard: {
        tasks: ["Design", "Development", "Testing", "Deployment"],
        startDates: ["2024-01-01", "2024-02-01", "2024-03-01", "2024-04-01"],
        endDates: ["2024-01-31", "2024-03-15", "2024-03-31", "2024-04-15"],
        progress: [100, 75, 30, 0],
        categories: ["Phase 1", "Phase 1", "Phase 2", "Phase 2"]
    },
    multiTeam: {
        tasks: [
            "Dev Team", "Dev Team", "Dev Team", "Marketing", "Marketing", "QA Team",
            "QA Team", "QA Team", "QA Team", "Design", "Design"
        ],
        startDates: [
            "2024-01-01", "2024-02-15", "2024-04-01", "2024-03-01", "2024-05-01",
            "2024-02-01", "2024-03-15", "2024-05-01", "2024-06-15", "2024-01-15",
            "2024-04-01"
        ],
        endDates: [
            "2024-02-28", "2024-04-15", "2024-06-30", "2024-05-15", "2024-07-31",
            "2024-03-31", "2024-05-15", "2024-06-30", "2024-08-15", "2024-03-31",
            "2024-06-15"
        ],
        progress: [100, 80, 40, 60, 10, 100, 90, 50, 0, 100, 70],
        categories: [
            "Backend", "Frontend", "API", "Campaign", "Social Media", "Unit Tests",
            "Integration", "Performance", "UAT", "UI Mockups", "Branding"
        ]
    },
    manyRows: {
        tasks: Array.from({ length: 80 }, (_, index) => `Team ${Math.floor(index / 4) + 1}`),
        startDates: Array.from({ length: 80 }, (_, index) => {
            const date = new Date(2024, 0, 1 + index * 4);
            return toDateOnly(date);
        }),
        endDates: Array.from({ length: 80 }, (_, index) => {
            const date = new Date(2024, 0, 18 + index * 4 + (index % 5) * 3);
            return toDateOnly(date);
        }),
        progress: Array.from({ length: 80 }, (_, index) => (index * 17) % 101),
        categories: Array.from(
            { length: 80 },
            (_, index) => `Activity ${String.fromCharCode(65 + (index % 10))}`
        )
    }
};

function renderVisual(): void {
    const params = new URLSearchParams(window.location.search);
    const scenarioName = params.get("scenario") || "standard";
    const scenario = scenarios[scenarioName] || scenarios.standard;
    const highContrast = params.get("highContrast") === "true";
    const target = document.querySelector<HTMLElement>("#visual-container");
    if (!target || !scenario) {
        throw new Error("Visual harness configuration is missing");
    }

    const host = createMockHost(highContrast);
    const dataView = buildMockDataView({
        ...scenario,
        objects: {
            title: {
                show: true,
                titleText: `Gantt - ${scenarioName}`
            },
            legend: {
                show: true
            }
        } as powerbi.DataViewObjects
    });
    const visual = new Visual({ element: target, host } as VisualConstructorOptions);
    const updateOptions = {
        dataViews: [dataView],
        viewport: {
            width: target.clientWidth,
            height: target.clientHeight
        },
        type: 2
    } as VisualUpdateOptions;

    target.style.background = host.colorPalette.background.value;
    visual.update(updateOptions);
    document.body.dataset.renderer = "production-visual";
}

function createMockHost(highContrast: boolean): IVisualHost {
    const selected: ISelectionId[] = [];
    let selectionCallback: (selectionIds: powerbi.extensibility.ISelectionId[]) => void =
        () => undefined;
    const selectionManager = {
        select: (
            selectionId: powerbi.extensibility.ISelectionId | powerbi.extensibility.ISelectionId[],
            multiSelect = false
        ) => {
            const incoming = (Array.isArray(selectionId) ? selectionId : [selectionId])
                .filter(isSelectionId);
            if (!multiSelect) {
                selected.splice(0, selected.length, ...incoming);
            } else {
                for (const id of incoming) {
                    const existingIndex = selected.findIndex(
                        existing => existing.getKey() === id.getKey()
                    );
                    if (existingIndex >= 0) {
                        selected.splice(existingIndex, 1);
                    } else {
                        selected.push(id);
                    }
                }
            }
            selectionCallback(selected);
            return Promise.resolve([...selected]);
        },
        clear: () => {
            selected.splice(0, selected.length);
            selectionCallback([]);
            return Promise.resolve({});
        },
        showContextMenu: () => Promise.resolve({}),
        getSelectionIds: () => [...selected],
        hasSelection: () => selected.length > 0,
        registerOnSelectCallback: (
            callback: (selectionIds: powerbi.extensibility.ISelectionId[]) => void
        ) => {
            selectionCallback = callback;
        },
        toggleExpandCollapse: () => Promise.resolve({})
    } as ISelectionManager;
    const color = (value: string): powerbi.IColorInfo => ({ value });
    const categoryColors = [
        "#2196F3", "#FF9800", "#4CAF50", "#9C27B0", "#F44336",
        "#00BCD4", "#795548", "#607D8B", "#E91E63", "#009688"
    ];

    return {
        instanceId: highContrast ? "browser-high-contrast" : "browser-standard",
        locale: "en-US",
        hostCapabilities: { allowInteractions: true },
        colorPalette: {
            isHighContrast: highContrast,
            foreground: color(highContrast ? "#ffffff" : "#333333"),
            foregroundLight: color("#666666"),
            foregroundDark: color("#111111"),
            foregroundNeutralLight: color(highContrast ? "#ffffff" : "#e0e0e0"),
            foregroundNeutralDark: color("#333333"),
            foregroundNeutralSecondary: color("#666666"),
            foregroundNeutralSecondaryAlt: color("#666666"),
            foregroundNeutralSecondaryAlt2: color("#666666"),
            foregroundNeutralTertiary: color("#999999"),
            foregroundNeutralTertiaryAlt: color("#999999"),
            foregroundSelected: color("#ffff00"),
            foregroundButton: color("#ffffff"),
            background: color(highContrast ? "#000000" : "#ffffff"),
            backgroundLight: color("#ffffff"),
            backgroundNeutral: color("#f2f2f2"),
            backgroundDark: color("#000000"),
            hyperlink: color("#00ffff"),
            visitedHyperlink: color("#ff00ff"),
            sentimentColors: {
                success: "#008000",
                warning: "#ffff00",
                danger: "#ff0000"
            },
            getColor: (key: string) => color(categoryColors[hashString(key) % categoryColors.length] || "#2196F3"),
            reset: () => undefined
        },
        createSelectionManager: () => selectionManager,
        createSelectionIdBuilder: () => {
            let rowIndex = -1;
            const builder = {
                withCategory: (_column: powerbi.DataViewCategoryColumn, index: number) => {
                    rowIndex = index;
                    return builder;
                },
                createSelectionId: () => createSelectionId(rowIndex)
            };
            return builder as unknown as powerbi.visuals.ISelectionIdBuilder;
        },
        tooltipService: {
            enabled: () => true,
            show: () => undefined,
            move: () => undefined,
            hide: () => undefined
        },
        eventService: {
            renderingStarted: () => {
                document.body.dataset.rendered = "false";
            },
            renderingFinished: () => {
                document.body.dataset.rendered = "true";
            },
            renderingFailed: (_options: VisualUpdateOptions, reason?: string) => {
                document.body.dataset.rendered = "failed";
                document.body.dataset.renderError = reason || "Unknown rendering failure";
            }
        },
        applyJsonFilter: () => undefined
    } as unknown as IVisualHost;
}

function createSelectionId(rowIndex: number): ISelectionId {
    const key = `browser-selection-${rowIndex}`;
    return {
        equals: other => other.getKey() === key,
        includes: other => other.getKey() === key,
        getKey: () => key,
        getSelector: () => ({}) as powerbi.data.Selector,
        getSelectorsByColumn: () => ({}) as powerbi.data.SelectorsByColumn,
        hasIdentity: () => true
    };
}

function isSelectionId(value: powerbi.extensibility.ISelectionId): value is ISelectionId {
    return typeof (value as Partial<ISelectionId>).getKey === "function";
}

function hashString(value: string): number {
    let hash = 0;
    for (const character of value) {
        hash = ((hash << 5) - hash + character.charCodeAt(0)) >>> 0;
    }
    return hash;
}

function toDateOnly(value: Date): string {
    const year = value.getFullYear().toString().padStart(4, "0");
    const month = (value.getMonth() + 1).toString().padStart(2, "0");
    const day = value.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`;
}

renderVisual();
