# Atlyn Gantt Chart

A free, open-source Power BI custom visual for project timelines, milestones, progress, categories, and report interactions.

![Power BI](https://img.shields.io/badge/Power_BI-API_5.11.1-yellow)
![License](https://img.shields.io/badge/License-MIT-green)
![Version](https://img.shields.io/badge/Version-1.0.8.0-blue)

## Features

- Date-scaled task bars with pinned axis and vertical scrolling
- Visible diamond milestones when start and end dates are equal
- Explicit Auto, 0-1 fraction, and 0-100 progress interpretation with ambiguity warnings
- Strict ISO date and datetime parsing, with hour/minute labels for sub-day tasks
- Category colors, legend, labels, grid lines, title, and today line
- Model-format-aware dates, progress values, and custom tooltip measures
- Selection, multi-selection, cross-highlighting, and optional model-filter interaction
- Optional unique Task ID is the stable selection/filter identity; blank or duplicate IDs safely fall back to Task identity
- Data-point and background context menus
- Keyboard operation, ARIA labels, focus indicators, and host-driven high-contrast colors
- Data-quality warnings for invalid rows, corrected/excluded reversed dates, and duplicate stable task IDs
- Virtualized row rendering and roving keyboard focus for high-volume portfolios
- Deterministic chronological ordering (start, end, identity, name, source row); the visual does not expose a host sort menu

## Data roles

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| **Task** | Grouping | Yes | Task or work item name |
| **Task ID** | Grouping | No | Optional unique stable identifier used for selection and model filtering. Blank or duplicate IDs fall back to Task identity; dependency support is not claimed |
| **Start Date** | Measure | Yes | Task start date |
| **End Date** | Measure | Yes | Task end date; equal dates render a milestone |
| **Progress** | Measure | No | Completion interpreted by the Chart Settings mode; blank/invalid values are omitted |
| **Category** | Grouping | No | Group or phase used for color |
| **Tooltips** | Measure | No | One or more additional model-formatted tooltip values |

## Format options

| Card | Options |
| --- | --- |
| **Chart Settings** | Today line, grid lines, progress interpretation, reversed-date handling, bar height, corner radius |
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
npm run validate:certification
```

`npm run validate:certification` starts with `npm audit --audit-level=moderate` and stops on any nonzero result before running lint, type checking, unit/integration tests, production browser tests, and `pbiviz package --certification-audit`. Build output is intentionally excluded from source control; use the audited `.pbiviz` produced in `dist`.

The categorical data reduction contract is capped at 5,000 rows. Synthetic tests exercise bounded virtualization with larger inputs, but that is not a full-model support claim. When Power BI supplies a reduced segment, the visual discloses it before rendering.

Touch supports stationary tap selection, tooltips, and long-press context menus. Dragging remains available for scrolling and suppresses selection/tooltips. RTL locales receive logical document direction and localized labels; only the shipped en-US and de-DE resources are guaranteed, with safe key fallback for other locales.

Virtualized viewport rendering is not a guarantee that PDF, PowerPoint, or image exports contain every row. Validate export output in Power BI Desktop; Desktop export behavior and mobile layout remain manual certification checks.

## Certification and privacy

- Power BI Visuals API is fixed at 5.11.1 and build tools are fixed at 7.2.0.
- ESLint is fixed at 10.8.0; the executable certification audit test requires zero critical, high, moderate, or total vulnerabilities.
- `capabilities.json` declares an empty `privileges` array.
- The visual makes no HTTP, HTTPS, WebSocket, telemetry, or other external resource requests.
- User and model data are written only through safe text/attribute DOM APIs.
- The repository contains source and tests for one visual only. Generated packages, temporary files, dependencies, and test results are not tracked.

This repository is the complete reviewable source for the package. The visual GUID is preserved across published updates.

## Testing a Marketplace update

Power BI normally loads the latest AppSource version for a published visual. To validate a local update without changing its GUID, enable **Developer mode for this session** under **File > Options and settings > Options > Current file > Report settings**, import the audited `.pbiviz`, then save the PBIX with visual version 1.0.8.0.

## License

[MIT](LICENSE)
