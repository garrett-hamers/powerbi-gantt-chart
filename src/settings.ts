/**
 * Formatting settings for the Gantt Chart
 */
import type powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

const MIN_VALIDATOR: powerbi.visuals.ValidatorType.Min = 0;
const MAX_VALIDATOR: powerbi.visuals.ValidatorType.Max = 1;

class ChartSettingsCard extends FormattingSettingsCard {
    showTodayLine = new formattingSettings.ToggleSwitch({
        name: "showTodayLine",
        displayName: "Show Today Line",
        value: true
    });

    showGridLines = new formattingSettings.ToggleSwitch({
        name: "showGridLines",
        displayName: "Show Grid Lines",
        value: true
    });

    progressInterpretation = new formattingSettings.ItemDropdown({
        name: "progressInterpretation",
        displayName: "Progress values",
        items: [
            { value: "auto", displayName: "Auto" },
            { value: "fraction", displayName: "Fraction (0 to 1)" },
            { value: "percent", displayName: "Percent (0 to 100)" }
        ],
        value: { value: "auto", displayName: "Auto" }
    });

    reversedDateHandling = new formattingSettings.ItemDropdown({
        name: "reversedDateHandling",
        displayName: "Reversed dates",
        items: [
            { value: "correct", displayName: "Correct and warn" },
            { value: "exclude", displayName: "Exclude and warn" }
        ],
        value: { value: "correct", displayName: "Correct and warn" }
    });

    barHeight = new formattingSettings.NumUpDown({
        name: "barHeight",
        displayName: "Bar Height",
        value: 24,
        options: {
            minValue: { type: MIN_VALIDATOR, value: 4 },
            maxValue: { type: MAX_VALIDATOR, value: 100 }
        }
    });

    barCornerRadius = new formattingSettings.NumUpDown({
        name: "barCornerRadius",
        displayName: "Bar Corner Radius",
        value: 4,
        options: {
            minValue: { type: MIN_VALIDATOR, value: 0 },
            maxValue: { type: MAX_VALIDATOR, value: 50 }
        }
    });

    name: string = "chartSettings";
    displayName: string = "Chart Settings";
    slices: Array<FormattingSettingsSlice> = [
        this.showTodayLine,
        this.showGridLines,
        this.progressInterpretation,
        this.reversedDateHandling,
        this.barHeight,
        this.barCornerRadius
    ];
}

class TitleCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Title",
        value: false
    });

    titleText = new formattingSettings.TextInput({
        name: "titleText",
        displayName: "Title Text",
        value: "",
        placeholder: "Chart title"
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 16,
        options: {
            minValue: { type: MIN_VALIDATOR, value: 8 },
            maxValue: { type: MAX_VALIDATOR, value: 72 }
        }
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Font Color",
        value: { value: "#333333" }
    });

    alignment = new formattingSettings.ItemDropdown({
        name: "alignment",
        displayName: "Alignment",
        items: [
            { value: "left", displayName: "Left" },
            { value: "center", displayName: "Center" },
            { value: "right", displayName: "Right" }
        ],
        value: { value: "left", displayName: "Left" }
    });

    name: string = "title";
    displayName: string = "Title";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.titleText,
        this.fontSize,
        this.fontColor,
        this.alignment
    ];
}

class DataLabelsCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Labels",
        value: true
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 11,
        options: {
            minValue: { type: MIN_VALIDATOR, value: 8 },
            maxValue: { type: MAX_VALIDATOR, value: 40 }
        }
    });

    showProgress = new formattingSettings.ToggleSwitch({
        name: "showProgress",
        displayName: "Show Progress %",
        value: true
    });

    name: string = "dataLabels";
    displayName: string = "Data Labels";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.fontSize,
        this.showProgress
    ];
}

class CategoriesCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Categories",
        value: true
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 11,
        options: {
            minValue: { type: MIN_VALIDATOR, value: 8 },
            maxValue: { type: MAX_VALIDATOR, value: 40 }
        }
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Font Color",
        value: { value: "#333333" }
    });

    name: string = "categories";
    displayName: string = "Categories";
    slices: Array<FormattingSettingsSlice> = [
        this.show,
        this.fontSize,
        this.fontColor
    ];
}

class DesignCard extends FormattingSettingsCard {
    categoryColor1 = new formattingSettings.ColorPicker({
        name: "categoryColor1",
        displayName: "Category Color 1",
        value: { value: "#2196F3" }
    });

    categoryColor2 = new formattingSettings.ColorPicker({
        name: "categoryColor2",
        displayName: "Category Color 2",
        value: { value: "#FF9800" }
    });

    categoryColor3 = new formattingSettings.ColorPicker({
        name: "categoryColor3",
        displayName: "Category Color 3",
        value: { value: "#4CAF50" }
    });

    categoryColor4 = new formattingSettings.ColorPicker({
        name: "categoryColor4",
        displayName: "Category Color 4",
        value: { value: "#9C27B0" }
    });

    categoryColor5 = new formattingSettings.ColorPicker({
        name: "categoryColor5",
        displayName: "Category Color 5",
        value: { value: "#F44336" }
    });

    categoryColor6 = new formattingSettings.ColorPicker({
        name: "categoryColor6",
        displayName: "Category Color 6",
        value: { value: "#00BCD4" }
    });

    categoryColor7 = new formattingSettings.ColorPicker({
        name: "categoryColor7",
        displayName: "Category Color 7",
        value: { value: "#795548" }
    });

    categoryColor8 = new formattingSettings.ColorPicker({
        name: "categoryColor8",
        displayName: "Category Color 8",
        value: { value: "#607D8B" }
    });

    categoryColor9 = new formattingSettings.ColorPicker({
        name: "categoryColor9",
        displayName: "Category Color 9",
        value: { value: "#E91E63" }
    });

    categoryColor10 = new formattingSettings.ColorPicker({
        name: "categoryColor10",
        displayName: "Category Color 10",
        value: { value: "#009688" }
    });

    progressColor = new formattingSettings.ColorPicker({
        name: "progressColor",
        displayName: "Progress Color",
        value: { value: "#1565C0" }
    });

    todayLineColor = new formattingSettings.ColorPicker({
        name: "todayLineColor",
        displayName: "Today Line Color",
        value: { value: "#E53935" }
    });

    barOpacity = new formattingSettings.NumUpDown({
        name: "barOpacity",
        displayName: "Bar Opacity (%)",
        value: 80,
        options: {
            minValue: { type: MIN_VALIDATOR, value: 0 },
            maxValue: { type: MAX_VALIDATOR, value: 100 },
            unitSymbol: "%",
            unitSymbolAfterInput: true
        }
    });

    name: string = "design";
    displayName: string = "Design";
    slices: Array<FormattingSettingsSlice> = [
        this.categoryColor1,
        this.categoryColor2,
        this.categoryColor3,
        this.categoryColor4,
        this.categoryColor5,
        this.categoryColor6,
        this.categoryColor7,
        this.categoryColor8,
        this.categoryColor9,
        this.categoryColor10,
        this.progressColor,
        this.todayLineColor,
        this.barOpacity
    ];
}

class InteractionCard extends FormattingSettingsCard {
    enableSelection = new formattingSettings.ToggleSwitch({
        name: "enableSelection",
        displayName: "Enable Selection",
        value: true
    });

    enableTooltips = new formattingSettings.ToggleSwitch({
        name: "enableTooltips",
        displayName: "Enable Tooltips",
        value: true
    });

    crossFilterMode = new formattingSettings.ItemDropdown({
        name: "crossFilterMode",
        displayName: "Cross-Filter Mode",
        items: [
            { value: "highlight", displayName: "Highlight" },
            { value: "filter", displayName: "Filter" }
        ],
        value: { value: "highlight", displayName: "Highlight" }
    });

    name: string = "interaction";
    displayName: string = "Interaction";
    slices: Array<FormattingSettingsSlice> = [
        this.enableSelection,
        this.enableTooltips,
        this.crossFilterMode
    ];
}

class LegendCard extends FormattingSettingsCard {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show Legend",
        value: true
    });

    name: string = "legend";
    displayName: string = "Legend";
    slices: Array<FormattingSettingsSlice> = [
        this.show
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    chartSettingsCard = new ChartSettingsCard();
    titleCard = new TitleCard();
    dataLabelsCard = new DataLabelsCard();
    categoriesCard = new CategoriesCard();
    legendCard = new LegendCard();
    designCard = new DesignCard();
    interactionCard = new InteractionCard();

    cards = [
        this.chartSettingsCard,
        this.titleCard,
        this.dataLabelsCard,
        this.categoriesCard,
        this.legendCard,
        this.designCard,
        this.interactionCard
    ];
}

export function localizeNewFormattingStrings(
    model: VisualFormattingSettingsModel,
    getText: (key: string) => string
): void {
    const chart = model.chartSettingsCard;
    chart.progressInterpretation.displayName = getText("Format_ProgressInterpretation");
    const selectedProgressValue = chart.progressInterpretation.value.value;
    chart.progressInterpretation.items = [
        { value: "auto", displayName: getText("Format_ProgressAuto") },
        { value: "fraction", displayName: getText("Format_ProgressFraction") },
        { value: "percent", displayName: getText("Format_ProgressPercent") }
    ];
    chart.progressInterpretation.value = chart.progressInterpretation.items.find(
        item => item.value === selectedProgressValue
    ) ?? chart.progressInterpretation.items[0];

    chart.reversedDateHandling.displayName = getText("Format_ReversedDates");
    const selectedDateValue = chart.reversedDateHandling.value.value;
    chart.reversedDateHandling.items = [
        { value: "correct", displayName: getText("Format_ReversedCorrect") },
        { value: "exclude", displayName: getText("Format_ReversedExclude") }
    ];
    chart.reversedDateHandling.value = chart.reversedDateHandling.items.find(
        item => item.value === selectedDateValue
    ) ?? chart.reversedDateHandling.items[0];
}
