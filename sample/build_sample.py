"""Generate clean, self-contained Power BI templates (.pbit) for the Atlyn Tornado,
Radar and Gantt visuals.

Why this exists
---------------
The samples previously submitted to AppSource were repurposed third-party demo
reports. They were 8.5-11.4 MB, embedded Obvience splash-screen PNGs as
registered resources, carried live dataset lineage (Gantt had a Connections
part) and contained no hints or tips. Atlyn Tornado Chart was failed under:

    1180.2.12   Slow Load Time
    1180.2.3.1  Sample File Hints and Tips

A generated sample fixes all of it at once: the model is an inline Power Query
#table literal, so there is no external connection and nothing to download; the
file is tens of kilobytes rather than megabytes; every page carries an on-canvas
hints panel; and no third-party asset is present.

Structure follows powerbi-play-axis/sample/build_pbit.py, which produced the
only two samples in the portfolio that passed sample-content review.

Usage:  python build_sample.py <tornado|radar|gantt> [--out PATH]
"""
import json
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
U16 = "utf-16-le"


# ------------------------------------------------------------------ data models
def tornado_rows():
    depts = [
        ("Engineering", [820, 910, 960, 1040], [780, 965, 1015, 1120]),
        ("Sales", [640, 700, 735, 790], [690, 745, 700, 860]),
        ("Marketing", [410, 445, 470, 505], [455, 430, 520, 545]),
        ("Support", [300, 320, 345, 360], [285, 340, 355, 395]),
        ("Operations", [520, 545, 560, 600], [540, 515, 590, 640]),
        ("Research", [260, 285, 300, 330], [240, 300, 285, 375]),
        ("Facilities", [180, 190, 195, 205], [195, 185, 210, 215]),
    ]
    out = []
    for name, plan, actual in depts:
        for q in range(4):
            out.append(("Q%d" % (q + 1), name, plan[q], actual[q]))
    return out


def radar_rows():
    return [
        ("Reliability", 8.6, 9.0), ("Performance", 7.4, 8.5),
        ("Security", 9.1, 9.5), ("Usability", 6.8, 8.0),
        ("Accessibility", 7.9, 9.0), ("Documentation", 5.9, 7.5),
        ("Supportability", 8.2, 8.5), ("Cost efficiency", 6.4, 7.0),
    ]


def gantt_rows():
    # Progress is expressed 0-100 rather than as a 0-1 fraction. The visual
    # scales by 100 only when the progress column's format string contains "%"
    # (dataParser.ts: progressScale), and a model measure's format does not
    # reach the dataView reliably, which rendered every bar as "1%". A plain
    # 0-100 number with a non-percent format takes the unscaled path and is
    # correct either way.
    return [
        ("Discovery workshops", "Discovery", (2026, 1, 6), (2026, 1, 24), 100),
        ("Requirements sign-off", "Discovery", (2026, 1, 20), (2026, 2, 7), 100),
        ("Solution architecture", "Design", (2026, 2, 3), (2026, 3, 6), 100),
        ("Data model design", "Design", (2026, 2, 17), (2026, 3, 20), 85),
        ("Semantic layer build", "Build", (2026, 3, 9), (2026, 4, 24), 62),
        ("Report development", "Build", (2026, 3, 30), (2026, 5, 22), 41),
        ("Integration testing", "Validate", (2026, 5, 11), (2026, 6, 12), 15),
        ("User acceptance testing", "Validate", (2026, 6, 1), (2026, 6, 26), 5),
        ("Training and rollout", "Deploy", (2026, 6, 22), (2026, 7, 17), 0),
        ("Hypercare", "Deploy", (2026, 7, 13), (2026, 8, 14), 0),
    ]


def col(name, dtype, fmt=None):
    c = {
        "name": name,
        "dataType": dtype,
        "sourceColumn": name,
        "summarizeBy": "none" if dtype in ("string", "dateTime") else "sum",
        "annotations": [{"name": "SummarizationSetBy", "value": "Automatic"}],
    }
    if fmt:
        c["formatString"] = fmt
    return c


MONEY = "\\$#,0;(\\$#,0);\\$#,0"


def tornado_model():
    body = ",\n            ".join('{"%s", "%s", %d, %d}' % r
                                 for r in tornado_rows())
    m = ("let\n"
         "    Source = #table(\n"
         "        type table [Quarter = text, Department = text, "
         "Plan = number, Actual = number],\n"
         "        {\n            " + body + "\n        }\n"
         "    )\n"
         "in\n"
         "    Source")
    return {
        "table": "Spend",
        "columns": [col("Quarter", "string"), col("Department", "string"),
                    col("Plan", "double", MONEY), col("Actual", "double", MONEY)],
        "measures": [
            {"name": "Planned Spend", "expression": "SUM(Spend[Plan])",
             "formatString": MONEY},
            {"name": "Actual Spend", "expression": "SUM(Spend[Actual])",
             "formatString": MONEY},
            {"name": "Variance",
             "expression": "SUM(Spend[Actual]) - SUM(Spend[Plan])",
             "formatString": MONEY},
        ],
        "m": m,
    }


def radar_model():
    body = ",\n            ".join('{"%s", %.1f, %.1f}' % r for r in radar_rows())
    m = ("let\n"
         "    Source = #table(\n"
         "        type table [Capability = text, Score = number, "
         "Target = number],\n"
         "        {\n            " + body + "\n        }\n"
         "    )\n"
         "in\n"
         "    Source")
    return {
        "table": "Assessment",
        "columns": [col("Capability", "string"), col("Score", "double", "0.0"),
                    col("Target", "double", "0.0")],
        "measures": [
            {"name": "Current Score", "expression": "AVERAGE(Assessment[Score])",
             "formatString": "0.0"},
            {"name": "Target Score", "expression": "AVERAGE(Assessment[Target])",
             "formatString": "0.0"},
            {"name": "Gap to Target",
             "expression":
                 "AVERAGE(Assessment[Target]) - AVERAGE(Assessment[Score])",
             "formatString": "0.0"},
        ],
        "m": m,
    }


def gantt_model():
    body = ",\n            ".join(
        '{"%s", "%s", #date(%d, %d, %d), #date(%d, %d, %d), %d}'
        % (t, ph, s[0], s[1], s[2], f[0], f[1], f[2], p)
        for t, ph, s, f, p in gantt_rows())
    m = ("let\n"
         "    Source = #table(\n"
         "        type table [Task = text, Phase = text, Start = date, "
         "Finish = date, Progress = number],\n"
         "        {\n            " + body + "\n        }\n"
         "    )\n"
         "in\n"
         "    Source")
    return {
        "table": "Plan",
        "columns": [col("Task", "string"), col("Phase", "string"),
                    col("Start", "dateTime", "yyyy-mm-dd"),
                    col("Finish", "dateTime", "yyyy-mm-dd"),
                    col("Progress", "double", "0")],
        "measures": [
            {"name": "Percent Complete", "expression": "AVERAGE(Plan[Progress])",
             "formatString": "0"},
        ],
        "m": m,
    }


def data_model_schema(md):
    return {
        "name": "Model",
        "compatibilityLevel": 1550,
        "model": {
            "culture": "en-US",
            "dataAccessOptions": {"legacyRedirects": True,
                                  "returnErrorValuesAsNull": True},
            "defaultPowerBIDataSourceVersion": "powerBI_V3",
            "sourceQueryCulture": "en-US",
            "tables": [{
                "name": md["table"],
                "columns": md["columns"],
                "measures": md["measures"],
                "partitions": [{"name": md["table"], "mode": "import",
                                "source": {"type": "m",
                                           "expression": md["m"]}}],
            }],
            "annotations": [
                {"name": "PBI_QueryOrder", "value": '["%s"]' % md["table"]},
                {"name": "__PBI_TimeIntelligenceEnabled", "value": "0"},
            ],
        },
    }


# ------------------------------------------------------------ property helpers
def bool_prop(v):
    return {"expr": {"Literal": {"Value": "true" if v else "false"}}}


def num_prop(v):
    return {"expr": {"Literal": {"Value": "%dD" % v}}}


def text_prop(v):
    return {"expr": {"Literal": {"Value": "'%s'" % v}}}


def title_vc(title, size=12):
    return {"title": [{"properties": {"text": text_prop(title),
                                      "fontSize": num_prop(size),
                                      "show": bool_prop(True)}}]}


TYPES = {
    "text": {"category": None, "underlyingType": 1},
    "date": {"dateTime": None, "underlyingType": 519},
    "number": {"numeric": True, "underlyingType": 259},
}

# powerbi QueryAggregateFunction ordinals
AGG_NAMES = {1: "Sum", 2: "Avg", 3: "Min", 4: "Max"}


def visual_container(guid, table, fields, x, y, w, h, name, title, z=1,
                     order_by=None):
    """A custom visual bound to an arbitrary set of roles.

    `fields` is a list of {role, field, kind: column|measure, type}. Every role
    gets exactly one projection, which is what the corrected capabilities.json
    now permits (max-only conditions, no min).

    Grouping columns are emitted before measures. Interleaving them breaks the
    dataView: Gantt, whose roles are task, startDate, endDate, progress,
    category, rendered its "Add Task, Start Date, and End Date fields" landing
    page when `category` trailed the measures in the Select list, and rendered
    correctly once both grouping columns led. Tornado and Radar happened to be
    declared columns-first already, which is why only Gantt showed it.
    """
    fields = ([f for f in fields
               if f["kind"] == "column" and f.get("agg") is None]
              + [f for f in fields
                 if f["kind"] != "column" or f.get("agg") is not None])

    selects, dt_selects, qm, roles = [], [], [], []
    ordering, projections = {}, {}

    if not fields:
        # No bindings: the visual renders its landing page and Desktop can
        # accept drops into every well.
        config = {
            "name": name,
            "layouts": [{"id": 0, "position": {
                "x": x, "y": y, "z": z, "width": w, "height": h,
                "tabOrder": 1}}],
            "singleVisual": {
                "visualType": guid, "projections": {},
                "drillFilterOtherVisuals": True, "objects": {},
                "vcObjects": title_vc(title)},
        }
        return {"x": x, "y": y, "z": z, "width": w, "height": h,
                "config": json.dumps(config), "filters": "[]"}

    for i, f in enumerate(fields):
        agg = f.get("agg")
        if agg is not None:
            # An aggregated column, not a model measure. The Gantt sample that
            # rendered correctly before this rewrite bound startDate/endDate
            # this way (Min(Date.MonthEndDate)), and model measures in those
            # roles produce a dataView the visual rejects - it falls back to its
            # "Add Task, Start Date, and End Date fields" landing page.
            qn = "%s(%s.%s)" % (AGG_NAMES[agg], table, f["field"])
            expr = {"Aggregation": {
                "Expression": {"Column": {
                    "Expression": {"SourceRef": {"Source": "s"}},
                    "Property": f["field"]}},
                "Function": agg}}
            dt_expr = {"Aggregation": {
                "Expression": {"Column": {
                    "Expression": {"SourceRef": {"Entity": table}},
                    "Property": f["field"]}},
                "Function": agg}}
            selects.append(dict(expr, Name=qn,
                                NativeReferenceName="%s %s"
                                % (AGG_NAMES[agg], f["field"])))
            qm.append({"Restatement": "%s of %s" % (AGG_NAMES[agg], f["field"]),
                       "Name": qn, "Type": 2048})
        else:
            qn = "%s.%s" % (table, f["field"])
            key = "Measure" if f["kind"] == "measure" else "Column"
            selects.append({key: {"Expression": {"SourceRef": {"Source": "s"}},
                                  "Property": f["field"]},
                            "Name": qn, "NativeReferenceName": f["field"]})
            dt_expr = {key: {"Expression": {"SourceRef": {"Entity": table}},
                             "Property": f["field"]}}
            qm.append({"Restatement": f["field"], "Name": qn,
                       "Type": 2048 if f["kind"] == "measure" else 0})

        projections[f["role"]] = [{"queryRef": qn}]
        ordering[f["role"]] = [i]
        roles.append({"Name": f["role"], "Projection": i, "isActive": False})
        # Carry the format string into the query metadata. Without it the visual
        # sees no format on the column: Gantt scales Progress by 100 only when
        # the format contains "%", so a 0-1 fraction rendered as "1%" on every
        # bar until this was plumbed through.
        if f.get("fmt"):
            qm[-1]["Format"] = f["fmt"]
        sel_entry = {
            "displayName": f["field"], "queryName": qn,
            "roles": {f["role"]: True}, "type": TYPES[f["type"]],
            "expr": dt_expr,
        }
        if f.get("fmt"):
            sel_entry["format"] = f["fmt"]
        dt_selects.append(sel_entry)

    proto = {"Version": 2,
             "From": [{"Name": "s", "Entity": table, "Type": 0}],
             "Select": selects}
    if order_by:
        # Without this a Gantt sorts alphabetically by task, which reads oddly
        # for a schedule.
        proto["OrderBy"] = [{
            "Direction": 1,
            "Expression": {"Column": {
                "Expression": {"SourceRef": {"Source": "s"}},
                "Property": order_by}}}]

    config = {
        "name": name,
        "layouts": [{"id": 0, "position": {"x": x, "y": y, "z": z, "width": w,
                                           "height": h, "tabOrder": 1}}],
        "singleVisual": {
            "visualType": guid,
            "projections": projections,
            "prototypeQuery": proto,
            "drillFilterOtherVisuals": True,
            "objects": {},
            "vcObjects": title_vc(title),
        },
    }
    query = {"Commands": [{"SemanticQueryDataShapeCommand": {
        "Query": proto,
        "Binding": {"Primary": {"Groupings": [
                        {"Projections": list(range(len(fields)))}]},
                    "DataReduction": {"DataVolume": 4,
                                      "Primary": {"Top": {"Count": 1000}}},
                    "Version": 1},
        "ExecutionMetricsKind": 1}}]}
    dt = {"projectionOrdering": ordering,
          "queryMetadata": {"Select": qm},
          "visualElements": [{"DataRoles": roles}],
          "selects": dt_selects, "objects": {}}
    return {"x": x, "y": y, "z": z, "width": w, "height": h,
            "config": json.dumps(config), "filters": "[]",
            "query": json.dumps(query), "dataTransforms": json.dumps(dt)}


def card_container(table, measure, x, y, w, h, name, title, z=0):
    qn = "%s.%s" % (table, measure)
    sel = {"Measure": {"Expression": {"SourceRef": {"Source": "s"}},
                       "Property": measure},
           "Name": qn, "NativeReferenceName": measure}
    config = {
        "name": name,
        "layouts": [{"id": 0, "position": {"x": x, "y": y, "z": z, "width": w,
                                           "height": h, "tabOrder": 3}}],
        "singleVisual": {"visualType": "card",
                         "projections": {"Values": [{"queryRef": qn}]},
                         "prototypeQuery": {
                             "Version": 2,
                             "From": [{"Name": "s", "Entity": table,
                                       "Type": 0}],
                             "Select": [sel]},
                         "drillFilterOtherVisuals": True,
                         "objects": {},
                         "vcObjects": title_vc(title, 11)},
    }
    query = {"Commands": [{"SemanticQueryDataShapeCommand": {
        "Query": {"Version": 2,
                  "From": [{"Name": "s", "Entity": table, "Type": 0}],
                  "Select": [sel]},
        "Binding": {"Primary": {"Groupings": [{"Projections": [0]}]},
                    "DataReduction": {"DataVolume": 3,
                                      "Primary": {"Top": {"Count": 1000}}},
                    "Version": 1},
        "ExecutionMetricsKind": 1}}]}
    dt = {"projectionOrdering": {"Values": [0]},
          "queryMetadata": {"Select": [{"Restatement": measure, "Name": qn,
                                        "Type": 2048}]},
          "visualElements": [{"DataRoles": [{"Name": "Values", "Projection": 0,
                                             "isActive": False}]}],
          "selects": [{"displayName": measure, "queryName": qn,
                       "roles": {"Values": True}, "type": TYPES["number"],
                       "expr": {"Measure": {
                           "Expression": {"SourceRef": {"Entity": table}},
                           "Property": measure}}}],
          "objects": {}}
    return {"x": x, "y": y, "z": z, "width": w, "height": h,
            "config": json.dumps(config), "filters": "[]",
            "query": json.dumps(query), "dataTransforms": json.dumps(dt)}


def textbox_container(x, y, w, h, name, paragraphs, z=2):
    """On-canvas hints and tips panel - AppSource policy 1180.2 / 1180.2.3.1."""
    runs = []
    for text, bold, size in paragraphs:
        style = {"fontSize": "%dpt" % size}
        if bold:
            style["fontWeight"] = "bold"
        runs.append({"textRuns": [{"value": text, "textStyle": style}]})
    config = {
        "name": name,
        "layouts": [{"id": 0, "position": {"x": x, "y": y, "z": z, "width": w,
                                           "height": h, "tabOrder": 0}}],
        "singleVisual": {
            "visualType": "textbox",
            "drillFilterOtherVisuals": True,
            "objects": {"general": [{"properties": {"paragraphs": runs}}]},
            "vcObjects": {
                "background": [{"properties": {
                    "show": {"expr": {"Literal": {"Value": "true"}}},
                    "color": {"solid": {"color": {"expr": {"Literal": {
                        "Value": "'#F5F3FF'"}}}}}}}],
                "border": [{"properties": {
                    "show": {"expr": {"Literal": {"Value": "true"}}},
                    "color": {"solid": {"color": {"expr": {"Literal": {
                        "Value": "'#7C3AED'"}}}}}}}],
            },
        },
    }
    return {"x": x, "y": y, "z": z, "width": w, "height": h,
            "config": json.dumps(config), "filters": "[]"}


def page(name, display, ordinal, containers):
    return {"name": name, "displayName": display, "filters": "[]",
            "ordinal": ordinal, "visualContainers": containers,
            "config": "{}", "displayOption": 1, "width": 1280, "height": 720}


# ------------------------------------------------------------------- the visuals
TIP = (24, 16, 1232, 92)
MAIN = (24, 120, 1232, 452)
CARD_Y, CARD_H = 584, 118


def build_spec(kind):
    if kind == "tornado":
        return {
            "guid": "tornadoChartATLYN7F3A2B9E4D1C8065",
            "repo": r"C:\Users\Garrett\powerbi-tornado-chart",
            "name": "Atlyn Tornado Chart",
            "model": tornado_model(),
            "fields": [
                {"role": "category", "field": "Department",
                 "kind": "column", "type": "text"},
                {"role": "leftMeasure", "field": "Planned Spend",
                 "kind": "measure", "type": "number"},
                {"role": "rightMeasure", "field": "Actual Spend",
                 "kind": "measure", "type": "number"},
            ],
            "cards": [("Planned Spend", "Planned total"),
                      ("Variance", "Actual minus planned")],
            "title": "Planned vs actual spend by department",
            "tips": [
                ("How to use this sample", True, 14),
                ("Atlyn Tornado Chart compares two measures back to back across "
                 "one category, so the gap between them is obvious at a glance. "
                 "Here Planned Spend on the left is set against Actual Spend on "
                 "the right for each department.", False, 11),
                ("Tip  Drop a field into Category, Left Measure and Right "
                 "Measure - each well takes one field. Use the Format pane to "
                 "recolour each side or switch on data labels. Click a bar to "
                 "cross-filter the cards below.", False, 11),
            ],
            "tips2": [
                ("Hints and tips", True, 14),
                ("Fields  Category takes any grouping column. Left Measure and "
                 "Right Measure each take a single numeric measure. Tooltips "
                 "accepts extra measures that appear on hover.", False, 11),
                ("Formatting  Set separate colours for the left and right bars, "
                 "turn on data labels, adjust the category axis font, and "
                 "control the gap between the two sides.", False, 11),
                ("Interaction  Selecting a bar cross-filters the rest of the "
                 "page; Ctrl-click to multi-select. Selections persist in "
                 "bookmarks. The visual honours report themes and high contrast "
                 "mode, and is fully keyboard navigable.", False, 11),
            ],
        }
    if kind == "radar":
        return {
            "guid": "radarChartATLYN5E8B2D4A9F1C7036",
            "repo": r"C:\Users\Garrett\powerbi-radar-chart",
            "name": "Atlyn Radar Chart",
            "model": radar_model(),
            "fields": [
                {"role": "axis", "field": "Capability",
                 "kind": "column", "type": "text"},
                {"role": "values", "field": "Current Score",
                 "kind": "measure", "type": "number"},
                {"role": "comparison", "field": "Target Score",
                 "kind": "measure", "type": "number"},
            ],
            "cards": [("Current Score", "Average score"),
                      ("Gap to Target", "Average gap to target")],
            "title": "Capability assessment against target",
            "tips": [
                ("How to use this sample", True, 14),
                ("Atlyn Radar Chart plots a measure around a circular axis so "
                 "the shape of a profile is easy to read, and can overlay a "
                 "second measure for comparison. Here Current Score is shown "
                 "against Target Score across eight capabilities.", False, 11),
                ("Tip  Drop a field into Axis, Values and Comparison - each "
                 "well takes one field. Use the Format pane to change the fill "
                 "opacity, show or hide the grid rings, and set the axis range.",
                 False, 11),
            ],
            "tips2": [
                ("Hints and tips", True, 14),
                ("Fields  Axis takes the grouping column that becomes the "
                 "spokes. Values takes the measure that is plotted. Comparison "
                 "is optional and draws a second series - useful for a target, "
                 "benchmark or prior period.", False, 11),
                ("Formatting  Control the series colours and fill opacity, the "
                 "number of grid rings, the axis minimum and maximum, and "
                 "whether individual data points are marked.", False, 11),
                ("Interaction  Selecting a spoke cross-filters the page and the "
                 "selection is saved with bookmarks. The visual honours report "
                 "themes and high contrast mode, and is fully keyboard "
                 "navigable.", False, 11),
            ],
        }
    if kind == "gantt":
        return {
            "guid": "ganttChartATLYN7F3A9D2B5E1C8046",
            "repo": r"C:\Users\Garrett\powerbi-gantt-chart",
            "name": "Atlyn Gantt Chart",
            "model": gantt_model(),
            "fields": [
                {"role": "task", "field": "Task",
                 "kind": "column", "type": "text"},
                {"role": "category", "field": "Phase",
                 "kind": "column", "type": "text"},
                {"role": "startDate", "field": "Start",
                 "kind": "column", "type": "date"},
                {"role": "endDate", "field": "Finish",
                 "kind": "column", "type": "date", "agg": 3},
                {"role": "progress", "field": "Percent Complete",
                 "kind": "measure", "type": "number"},
            ],
            "orderBy": "Start",
            "cards": [("Percent Complete", "Average completion (%)")],
            "title": "Delivery plan by phase",
            "tips": [
                ("How to use this sample", True, 14),
                ("Atlyn Gantt Chart lays tasks out on a time axis, one bar per "
                 "task, shaded to show how far each has progressed. Bars are "
                 "grouped and coloured by the Category field - here the "
                 "delivery phase.", False, 11),
                ("Tip  Drop a field into Task, Start Date, End Date, Progress "
                 "and Category - each well takes one field. Start Date and End "
                 "Date accept a date column; Power BI aggregates them as "
                 "Earliest and Latest.", False, 11),
            ],
            "tips2": [
                ("Hints and tips", True, 14),
                ("Fields  Task is the bar label. Start Date and End Date take a "
                 "date column, aggregated as Earliest and Latest. Progress "
                 "shades the completed part of each bar - supply a plain 0 to "
                 "100 number, or a 0 to 1 fraction formatted as a percentage. "
                 "Category groups and colours the bars.", False, 11),
                ("Formatting  Change the bar height and corner radius, the "
                 "colour per category, the date axis granularity, and whether "
                 "task labels and a today marker are shown.", False, 11),
                ("Interaction  Selecting a bar cross-filters the page and is "
                 "saved with bookmarks. The visual honours report themes and "
                 "high contrast mode, and is fully keyboard navigable.",
                 False, 11),
            ],
        }
    raise SystemExit("unknown visual %r" % kind)


def layout(spec):
    table = spec["model"]["table"]
    cards = []
    n = len(spec["cards"])
    cw = (1232 - 16 * (n - 1)) // n
    for i, (measure, ctitle) in enumerate(spec["cards"]):
        cards.append(card_container(table, measure, 24 + i * (cw + 16),
                                    CARD_Y, cw, CARD_H, "card%d" % i, ctitle))

    short = spec["name"].replace("Atlyn ", "")
    ob = spec.get("orderBy")
    p1 = page("p1", "%s showcase" % short, 0, [
        textbox_container(TIP[0], TIP[1], TIP[2], TIP[3], "tip1", spec["tips"]),
        visual_container(spec["guid"], table, spec["fields"],
                         MAIN[0], MAIN[1], MAIN[2], MAIN[3], "viz1",
                         spec["title"], order_by=ob),
    ] + cards)

    p2 = page("p2", "Hints and tips", 1, [
        textbox_container(24, 16, 1232, 300, "tip2", spec["tips2"]),
        visual_container(spec["guid"], table, spec["fields"],
                         24, 332, 1232, 372, "viz2", spec["title"],
                         order_by=ob),
    ])

    return {
        "id": 0,
        "resourcePackages": [{"resourcePackage": {
            "name": spec["guid"], "type": 0,
            "items": [{"name": "%s.pbiviz.json" % spec["guid"],
                       "path": "%s.pbiviz.json" % spec["guid"], "type": 5}],
            "disabled": False}}],
        "sections": [p1, p2],
        "config": json.dumps({
            "version": "5.54",
            "themeCollection": {"baseTheme": {"name": "CY24SU06"}},
            "activeSectionIndex": 0,
            "defaultDrillFilterOtherVisuals": True,
            "settings": {"useStylableVisualContainerHeader": True},
            "objects": {}}),
        "layoutOptimization": 0,
        "publicCustomVisuals": [],
        "filters": "[]",
        "pods": [],
    }


CONTENT_TYPES = (
    '<?xml version="1.0" encoding="utf-8"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="json" ContentType="" />'
    '<Default Extension="png" ContentType="" />'
    '<Default Extension="xml" ContentType="" />'
    '<Override PartName="/Version" ContentType="" />'
    '<Override PartName="/Report/Layout" ContentType="" />'
    '<Override PartName="/Settings" ContentType="application/json" />'
    '<Override PartName="/Metadata" ContentType="application/json" />'
    '<Override PartName="/DataModelSchema" ContentType="" />'
    "</Types>"
)


def newest_pbiviz(repo):
    """Newest built package. Prefers the dist/ of the repo this script lives in,
    so the tool works when vendored into an individual visual's repository, and
    falls back to the absolute path in the spec."""
    for dist in (os.path.join(os.path.dirname(HERE), "dist"),
                 os.path.join(repo, "dist")):
        if not os.path.isdir(dist):
            continue
        cands = [f for f in os.listdir(dist) if f.endswith(".pbiviz")]
        if not cands:
            continue
        cands.sort(key=lambda f: os.path.getmtime(os.path.join(dist, f)))
        return os.path.join(dist, cands[-1])
    raise SystemExit("no .pbiviz found - run npm run package first")


def main():
    argv = sys.argv[1:]
    if not argv:
        raise SystemExit(__doc__)
    kind = argv[0]
    minimal = "--minimal" in argv
    empty = "--empty" in argv
    spec = build_spec("gantt" if kind == "gantt-min" else kind)
    if minimal or kind == "gantt-min":
        keep = {"task", "startDate", "endDate"}
        spec["fields"] = [f for f in spec["fields"] if f["role"] in keep]
    if empty:
        # Emit the visual with no field bindings so Power BI Desktop can author
        # them itself via drag and drop. Hand-written bindings for Gantt did not
        # produce a dataView the visual accepted; letting the host build the
        # query is authoritative.
        spec["fields"] = []
    out = (argv[argv.index("--out") + 1] if "--out" in argv
           else os.path.join(HERE, "out", "Atlyn%sSample.pbit" % kind.title()))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)

    src = newest_pbiviz(spec["repo"])
    with zipfile.ZipFile(src) as pz:
        pkg_json = pz.read("package.json")
        viz_json = pz.read("resources/%s.pbiviz.json" % spec["guid"])

    if os.path.exists(out):
        os.remove(out)

    g = spec["guid"]
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("Version", "1.28".encode(U16))
        z.writestr("[Content_Types].xml", CONTENT_TYPES.encode("utf-8-sig"))
        z.writestr("DataModelSchema", json.dumps(
            data_model_schema(spec["model"]), ensure_ascii=False).encode(U16))
        z.writestr("Settings", json.dumps(
            {"Version": 1, "ReportSettings": {"ShowHiddenFields": True}}
        ).encode(U16))
        z.writestr("Metadata", json.dumps({
            "Version": 5, "AutoCreatedRelationships": [],
            "FileDescription": "%s sample report" % spec["name"],
            "CreatedFrom": "Desktop"}).encode(U16))
        z.writestr("Report/Layout", json.dumps(
            layout(spec), ensure_ascii=False).encode(U16))
        z.writestr("Report/CustomVisuals/%s/package.json" % g, pkg_json)
        z.writestr("Report/CustomVisuals/%s/resources/%s.pbiviz.json" % (g, g),
                   viz_json)

    print("wrote %s (%d bytes) from %s"
          % (out, os.path.getsize(out), os.path.basename(src)))


if __name__ == "__main__":
    main()
