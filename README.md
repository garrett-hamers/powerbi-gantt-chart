# Atlyn Gantt Chart

A free, open-source Power BI custom visual for project timelines, milestones, progress, categories, and report interactions.

![Power BI](https://img.shields.io/badge/Power_BI-API_5.11.1-yellow)
![License](https://img.shields.io/badge/License-MIT-green)
![Version](https://img.shields.io/badge/Version-1.0.2.0-blue)

## Features

- Date-scaled task bars with pinned axis and vertical scrolling
- Visible diamond milestones when start and end dates are equal
- Column-consistent progress overlays supporting 0-100 values or percentage-formatted fractions; blank and invalid progress remains unavailable
- Strict ISO date and datetime parsing, with hour/minute labels for sub-day tasks
- Category colors, legend, labels, grid lines, title, and today line
- Model-format-aware dates, progress values, and custom tooltip measures
- Selection, multi-selection, cross-highlighting, and optional model-filter interaction
- Data-point and background context menus
- Keyboard operation, ARIA labels, focus indicators, and host-driven high-contrast colors
- Safe handling for empty, partial, invalid, non-finite, reversed, and high-volume data

## Data roles

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| **Task** | Grouping | Yes | Task or work item name |
| **Start Date** | Measure | Yes | Task start date |
| **End Date** | Measure | Yes | Task end date; equal dates render a milestone |
| **Progress** | Measure | No | Completion as 0-100 or a percentage-formatted fraction; blank/invalid values are omitted |
| **Category** | Grouping | No | Group or phase used for color |
| **Tooltips** | Measure | No | One or more additional model-formatted tooltip values |

## Format options

| Card | Options |
| --- | --- |
| **Chart Settings** | Today line, grid lines, bar height, corner radius |
| **Title** | Visibility, text, size, color, alignment |
| **Data Labels** | Visibility, size, progress value |
| **Categories** | Visibility, size, color |
| **Legend** | Visibility |
| **Design** | Category colors, progress color, today line color, opacity |
| **Interaction** | Selection, tooltips, highlight or model-filter mode |

## Development

Requirements: Node.js 20.19 or newer and npm supported by `powerbi-visuals-tools` 7.2.0.

```powershell
npm ci
npm run eslint
npm test
npm run test:visual
npm run package
```

`npm run package` invokes `pbiviz package --certification-audit`. Build output is intentionally excluded from source control; use the audited `.pbiviz` produced in `dist`.

## Certification and privacy

- Power BI Visuals API is fixed at 5.11.1 and build tools are fixed at 7.2.0.
- `capabilities.json` declares an empty `privileges` array.
- The visual makes no HTTP, HTTPS, WebSocket, telemetry, or other external resource requests.
- User and model data are written only through safe text/attribute DOM APIs.
- The repository contains source and tests for one visual only. Generated packages, temporary files, dependencies, and test results are not tracked.

This repository is the complete reviewable source for the package. The visual GUID is preserved across published updates.

## Testing a Marketplace update

Power BI normally loads the latest AppSource version for a published visual. To validate a local update without changing its GUID, enable **Developer mode for this session** under **File > Options and settings > Options > Current file > Report settings**, import the audited `.pbiviz`, then save the PBIX with visual version 1.0.2.0.

## License

[MIT](LICENSE)
