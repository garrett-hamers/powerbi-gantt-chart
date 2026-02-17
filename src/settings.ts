/**
 * Formatting settings for the Gantt Chart
 */
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

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

    barHeight = new formattingSettings.NumUpDown({
        name: "barHeight",
        displayName: "Bar Height",
        value: 24
    });

    barCornerRadius = new formattingSettings.NumUpDown({
        name: "barCornerRadius",
        displayName: "Bar Corner Radius",
        value: 4
    });

    name: string = "chartSettings";
    displayName: string = "Chart Settings";
    slices: Array<FormattingSettingsSlice> = [
        this.showTodayLine,
        this.showGridLines,
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
        value: 16
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
        value: 11
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
        value: 11
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
        value: 80
    });

    name: string = "design";
    displayName: string = "Design";
    slices: Array<FormattingSettingsSlice> = [
        this.categoryColor1,
        this.categoryColor2,
        this.categoryColor3,
        this.categoryColor4,
        this.categoryColor5,
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

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    chartSettingsCard = new ChartSettingsCard();
    titleCard = new TitleCard();
    dataLabelsCard = new DataLabelsCard();
    categoriesCard = new CategoriesCard();
    designCard = new DesignCard();
    interactionCard = new InteractionCard();

    cards = [
        this.chartSettingsCard,
        this.titleCard,
        this.dataLabelsCard,
        this.categoriesCard,
        this.designCard,
        this.interactionCard
    ];
}
