# Sample report generator

Reproducible tooling for the AppSource sample report. None of this ships inside
the `.pbiviz`.

## Why it exists

The sample originally submitted to AppSource was a repurposed third-party demo
report: 8.5–11.4 MB, with an embedded Obvience splash-screen PNG, no guidance
text, and (for Gantt) live dataset lineage in a `Connections` part. Atlyn Tornado
Chart was failed under:

- **1180.2.12** Slow Load Time
- **1180.2.3.1** Sample File Hints and Tips

A generated sample fixes all of it at once. The model is an inline Power Query
`#table` literal, so there is no external connection and nothing to download; the
file is tens of kilobytes; every page carries an on-canvas Hints and Tips panel;
and no third-party asset is present.

## Pipeline

```
build_sample.py  →  .pbit  (inline #table data + embedded visual + full layout)
       ↓             open once in Desktop, Save As .pbix   ← the only step that
                                                             cannot be scripted
convert.ps1      →  drives that step through UI Automation
```

A `.pbix` contains a compiled binary `DataModel` part that only Power BI Desktop
can produce, which is why the middle step exists. Desktop's ribbon ignores
`SendKeys`, so `convert.ps1` uses UI Automation for the ribbon and Win32 for the
Save As dialog (UIA `FindAll(Descendants)` can hang on it). `focus.ps1` proves
the target window is genuinely foregrounded before any input is sent.

```powershell
npm run package                     # produces dist/*.pbiviz
python sample\build_sample.py tornado
powershell -File sample\convert.ps1 -Pbit sample\out\AtlynTornadoSample.pbit `
                                    -Pbix sample\out\SampleReport.pbix
```

`author.ps1` is the fallback: it opens a `.pbit` whose visual has **no** field
bindings and drags fields into the wells, letting Desktop author the query. Use
it when a hand-written binding does not produce a dataView the visual accepts —
whatever Desktop writes is authoritative and can then be copied back into
`build_sample.py`.

## Binding rules learned the hard way

These are not obvious and cost several rebuild cycles:

1. **Grouping columns must precede measures in the `Select` list.** Interleaving
   them is not reliable.

2. **A role bound in a `values` bucket wants a column aggregation, not always a
   model measure.** For Gantt, Desktop authors `startDate` as a *plain column*
   and `endDate` as `Min(...)`. Binding both as model measures returned a
   dataView the visual rejected, so it rendered its "Add Task, Start Date, and
   End Date fields" landing page even though every role was populated.

3. **`visualElements.DataRoles[].Projection` is the index into `Select`**, not 0
   for each role. Desktop repairs this on save, but get it right anyway.

4. **A measure's format string does not reliably reach `source.format` in the
   dataView.** Gantt scales Progress by 100 only when that format contains `%`
   (`dataParser.ts`, `progressScale`), so a 0–1 fraction rendered as `1%` on
   every bar. The sample therefore supplies Progress as a plain 0–100 number,
   which takes the unscaled path. Both forms are supported by the visual.

5. **The visual uses deterministic chronological ordering** (start date, end date,
   stable identity, name, then source row), so the sample generator and visual
   remain predictable without claiming a host sort menu.

The visual's categorical data reduction ceiling is 5,000 rows. Larger synthetic
inputs are useful for bounded virtualization tests only; they do not represent
full-model support. Virtualized viewport rendering is not a guarantee for PDF,
PowerPoint, or image export, which must be checked manually in Desktop.

## Verifying before submission

Screenshot the saved `.pbix` and *look at it*. A structurally valid file that
renders a landing page or nonsense labels will pass every static check and still
fail certification — that is exactly how the original defect shipped.
