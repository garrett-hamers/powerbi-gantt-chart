# Atlyn Gantt Chart

A free, open-source Power BI custom visual for Gantt charts. Visualize project timelines with task bars, progress tracking, and category coloring — ideal for project management, sprint planning, and scheduling.

![Power BI](https://img.shields.io/badge/Power_BI-API_5.3-yellow)
![License](https://img.shields.io/badge/License-MIT-green)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)

---

## Features

### Timeline Visualization
- Horizontal bars on a time-scaled X axis
- Each bar spans from task start date to end date
- Y axis shows task names using d3.scaleBand

### Progress Tracking
- Optional progress overlay (filled portion of each bar)
- Progress percentage shown in data labels
- Configurable progress color

### Visual Elements
- Today line (vertical dashed line at current date)
- Grid lines for time periods
- Color-coded bars by category/phase
- 5-color customizable category palette

### Interactive
- Click a bar to select a task
- Ctrl+click for multi-select
- Hover tooltips with task details, dates, progress, and custom measures
- Right-click context menu

---

## Data Roles

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| **Task** | Grouping | ✅ | Task name |
| **Start Date** | Measure | ✅ | Task start date |
| **End Date** | Measure | ✅ | Task end date |
| **Progress** | Measure | | Completion percentage (0-100) |
| **Category** | Grouping | | Group/phase for color coding |
| **Tooltips** | Measure | | Additional measures shown in tooltips |

---

## Format Pane Options

| Card | Options |
|------|---------|
| **Chart Settings** | Show today line, show grid lines, bar height, bar corner radius |
| **Title** | Show/hide, text, font size, color, alignment |
| **Data Labels** | Show/hide, font size, show progress % |
| **Categories** | Show/hide, font size, font color |
| **Design** | 5 category colors, progress color, today line color, bar opacity |
| **Interaction** | Enable selection, enable tooltips, cross-filter mode |

---

## Installation

### From Package
1. Download `atlynGanttChart.pbiviz` from the [`dist/`](dist/) folder
2. In Power BI Desktop → **File → Import → Power BI Visual**
3. Select the downloaded file

### Development

```bash
# Install dependencies
npm install

# Start dev server (requires Power BI developer mode)
npm start

# Run tests
npm test

# Package for distribution
npm run package
```

---

## Testing

Automated tests across 2 test files:

| Suite | Tests | Coverage |
|-------|-------|----------|
| Data Parser | 15 | Date parsing, progress clamping, missing dates, categories, tooltips, edge cases |
| Chart Rendering | 18 | Bars, today line, grid lines, progress overlay, no NaN, title, labels, colors, edge cases |

```bash
npm test
```

---

## Tech Stack

- **Power BI Visuals API** 5.3.0
- **D3.js** for timeline rendering
- **TypeScript** with strict mode
- **Vitest** + happy-dom for testing

---

## License

MIT License — free for personal and commercial use.

---

## Credits

Built by [Atlyn](https://github.com/garrett-hamers).
