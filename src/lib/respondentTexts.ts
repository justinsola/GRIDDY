import type { GridConfig, SelectionMode, SkipBehavior } from "../grid-types";

/**
 * The words GRIDDY adds around a grid for respondents: instructions, the
 * reminder when Next finds empty cells, its buttons, Next, and what screen
 * readers say. Qualtrics' Translate tool does not reach them, so each grid
 * keeps its own wording in survey.respondentTexts; a text it leaves out or
 * leaves empty is GRIDDY's English below. The exported script gets the
 * merged set, from respondentTextsFor.
 *
 * Every text is a whole sentence. The script fills in placeholders such as
 * {n} or {row}, and wherever a count appears there are two texts: "One" for
 * 1 and "Other" for 2 or more.
 */

export type Placeholder = "n" | "off" | "row" | "col" | "label" | "reaction";

/** How a grid is answered, which decides the texts respondents meet. */
export interface RespondentTextSetup {
  selectionMode: SelectionMode;
  /** Respondents react to a pre-filled grid. */
  experiment: boolean;
  skipBehavior: SkipBehavior;
  /** Respondents can answer the grid: an experiment with reaction labels, or
   * a grid with labels and interaction on. One they cannot answer only shows
   * the scroll hint and the arrows, and its dropdowns if it draws them.
   * Missing counts as true. */
  answerable?: boolean;
  /** The grid draws a dropdown in each cell, as one answered with dropdowns
   * and interaction on does even without labels. Missing counts as true. */
  dropdownsDrawn?: boolean;
}

/** Where respondents meet a text: on screen, in the reminder Next shows, or
 * only through a screen reader. */
export type RespondentTextGroup = "screen" | "reminder" | "screenReader";

export interface RespondentTextInfo {
  /** GRIDDY's English. A grid without wording of its own shows exactly
   * this, as every grid did before these texts could be changed. */
  english: string;
  /** A short name for the editor. */
  label: string;
  group: RespondentTextGroup;
  /** The placeholders the script fills in, and what each one becomes. */
  fills?: Partial<Record<Placeholder, string>>;
  /** The placeholders the text needs to say what it is for. */
  required?: Placeholder[];
  /** Whether respondents meet the text in a grid set up this way, when they
   * can answer it; respondentTextKeysFor also handles one they cannot. */
  usedBy: (setup: RespondentTextSetup) => boolean;
}

const always = () => true;
const checks = (s: RespondentTextSetup) => s.skipBehavior !== "allow";
const reminds = (s: RespondentTextSetup) => s.skipBehavior === "remind";
const requires = (s: RespondentTextSetup) => s.skipBehavior === "force";

const OFF = { off: "how many of them are off-screen" };
const EMPTY = { n: "the number of empty cells" };
const UNREACTED = { n: "the number of pre-filled cells without a reaction" };
const CELL = { row: "the row number", col: "the column number" };
// In an experiment, the cells still to answer are pre-filled cells without
// a reaction.
const PAST_ARROW = { n: "the number of cells past the arrow still to answer" };

const TEXTS = {
  // On screen
  placing: {
    english: "Placing:",
    label: "Before the label buttons",
    group: "screen",
    usedBy: (s) => !s.experiment && s.selectionMode === "paint",
  },
  reacting: {
    english: "Reacting:",
    label: "Before the reaction buttons",
    group: "screen",
    usedBy: (s) => s.experiment && s.selectionMode === "paint",
  },
  dragLabel: {
    english: "Drag a label onto a cell, or select a label and then a cell:",
    label: "Above the labels to drag",
    group: "screen",
    usedBy: (s) => !s.experiment && s.selectionMode === "dragdrop",
  },
  dragReaction: {
    english: "Drag a reaction onto a cell, or select a reaction and then a cell:",
    label: "Above the reactions to drag",
    group: "screen",
    usedBy: (s) => s.experiment && s.selectionMode === "dragdrop",
  },
  clearCellChip: {
    english: "Clear cell",
    label: "Chip that empties a cell",
    group: "screen",
    usedBy: (s) => !s.experiment && s.selectionMode === "dragdrop",
  },
  clearReactionChip: {
    english: "Clear reaction",
    label: "Chip that removes a reaction",
    group: "screen",
    usedBy: (s) => s.experiment && s.selectionMode === "dragdrop",
  },
  clearButtonTitle: {
    english: "Clear cell",
    label: "Tooltip on a cell's × button",
    group: "screen",
    usedBy: (s) => s.selectionMode === "dragdrop",
  },
  chooseLabel: {
    english: "Choose label",
    label: "Empty choice in each dropdown",
    group: "screen",
    usedBy: (s) => !s.experiment && s.selectionMode === "dropdown",
  },
  chooseReaction: {
    english: "— react —",
    label: "Empty choice in each dropdown",
    group: "screen",
    usedBy: (s) => s.experiment && s.selectionMode === "dropdown",
  },
  scrollHint: {
    english: "↔ Part of this grid is out of view. Scroll sideways to see all of it.",
    label: "When the grid is wider than the screen",
    group: "screen",
    usedBy: always,
  },
  showMe: {
    english: "Show me",
    label: "Button that finds the cells",
    group: "screen",
    usedBy: checks,
  },
  continueAnyway: {
    english: "Continue anyway",
    label: "Button that moves on",
    group: "screen",
    usedBy: reminds,
  },
  next: {
    english: "Next",
    label: "Next button",
    group: "screen",
    usedBy: checks,
  },

  // The reminder: how many cells, where they are, what to do.
  emptyOne: {
    english: "{n} cell is still empty.",
    label: "How many: 1 cell",
    group: "reminder",
    fills: EMPTY,
    usedBy: (s) => !s.experiment && checks(s),
  },
  emptyOther: {
    english: "{n} cells are still empty.",
    label: "How many: 2 or more",
    group: "reminder",
    fills: EMPTY,
    required: ["n"],
    usedBy: (s) => !s.experiment && checks(s),
  },
  emptyOffscreenOne: {
    english: "{n} cell is still empty, and it is off-screen.",
    label: "How many: 1 cell, off-screen",
    group: "reminder",
    fills: EMPTY,
    usedBy: (s) => !s.experiment && checks(s),
  },
  emptyOffscreenOther: {
    english: "{n} cells are still empty, all of them off-screen.",
    label: "How many: 2 or more, all off-screen",
    group: "reminder",
    fills: EMPTY,
    required: ["n"],
    usedBy: (s) => !s.experiment && checks(s),
  },
  emptySomeOffscreenOne: {
    english: "{n} cells are still empty, including {off} off-screen.",
    label: "How many: 2 or more, 1 of them off-screen",
    group: "reminder",
    fills: { ...EMPTY, ...OFF },
    required: ["n"],
    usedBy: (s) => !s.experiment && checks(s),
  },
  emptySomeOffscreenOther: {
    english: "{n} cells are still empty, including {off} off-screen.",
    label: "How many: 2 or more, 2 or more of them off-screen",
    group: "reminder",
    fills: { ...EMPTY, ...OFF },
    required: ["n", "off"],
    usedBy: (s) => !s.experiment && checks(s),
  },
  unreactedOne: {
    english: "{n} pre-filled cell has no reaction yet.",
    label: "How many: 1 cell",
    group: "reminder",
    fills: UNREACTED,
    usedBy: (s) => s.experiment && checks(s),
  },
  unreactedOther: {
    english: "{n} pre-filled cells have no reaction yet.",
    label: "How many: 2 or more",
    group: "reminder",
    fills: UNREACTED,
    required: ["n"],
    usedBy: (s) => s.experiment && checks(s),
  },
  unreactedOffscreenOne: {
    english: "{n} pre-filled cell has no reaction yet, and it is off-screen.",
    label: "How many: 1 cell, off-screen",
    group: "reminder",
    fills: UNREACTED,
    usedBy: (s) => s.experiment && checks(s),
  },
  unreactedOffscreenOther: {
    english: "{n} pre-filled cells have no reaction yet, all of them off-screen.",
    label: "How many: 2 or more, all off-screen",
    group: "reminder",
    fills: UNREACTED,
    required: ["n"],
    usedBy: (s) => s.experiment && checks(s),
  },
  unreactedSomeOffscreenOne: {
    english: "{n} pre-filled cells have no reaction yet, including {off} off-screen.",
    label: "How many: 2 or more, 1 of them off-screen",
    group: "reminder",
    fills: { ...UNREACTED, ...OFF },
    required: ["n"],
    usedBy: (s) => s.experiment && checks(s),
  },
  unreactedSomeOffscreenOther: {
    english: "{n} pre-filled cells have no reaction yet, including {off} off-screen.",
    label: "How many: 2 or more, 2 or more of them off-screen",
    group: "reminder",
    fills: { ...UNREACTED, ...OFF },
    required: ["n", "off"],
    usedBy: (s) => s.experiment && checks(s),
  },
  outlinedOne: {
    english: "It is outlined in orange.",
    label: "Where: 1 cell",
    group: "reminder",
    usedBy: checks,
  },
  outlinedOther: {
    english: "They are outlined in orange.",
    label: "Where: 2 or more",
    group: "reminder",
    usedBy: checks,
  },
  remindFillOne: {
    english: "You can fill it in now or continue anyway.",
    label: "What to do: 1 cell",
    group: "reminder",
    usedBy: (s) => !s.experiment && reminds(s),
  },
  remindFillOther: {
    english: "You can fill them in now or continue anyway.",
    label: "What to do: 2 or more",
    group: "reminder",
    usedBy: (s) => !s.experiment && reminds(s),
  },
  remindReactOne: {
    english: "You can react to it now or continue anyway.",
    label: "What to do: 1 cell",
    group: "reminder",
    usedBy: (s) => s.experiment && reminds(s),
  },
  remindReactOther: {
    english: "You can react to them now or continue anyway.",
    label: "What to do: 2 or more",
    group: "reminder",
    usedBy: (s) => s.experiment && reminds(s),
  },
  requireFill: {
    english: "Please fill in every outlined cell before continuing.",
    label: "What to do",
    group: "reminder",
    usedBy: (s) => !s.experiment && requires(s),
  },
  requireReact: {
    english: "Please react to every outlined cell before continuing.",
    label: "What to do",
    group: "reminder",
    usedBy: (s) => s.experiment && requires(s),
  },

  // Heard only with a screen reader
  spokenRemindOne: {
    english: "Use Show me to find it, or Continue anyway.",
    label: "Spoken reminder, what to do: 1 cell",
    group: "screenReader",
    usedBy: reminds,
  },
  spokenRemindOther: {
    english: "Use Show me to find them, or Continue anyway.",
    label: "Spoken reminder, what to do: 2 or more",
    group: "screenReader",
    usedBy: reminds,
  },
  spokenRequireFill: {
    english: "Please fill in every cell before continuing.",
    label: "Spoken reminder, what to do",
    group: "screenReader",
    usedBy: (s) => !s.experiment && requires(s),
  },
  spokenRequireReact: {
    english: "Please react to every pre-filled cell before continuing.",
    label: "Spoken reminder, what to do",
    group: "screenReader",
    usedBy: (s) => s.experiment && requires(s),
  },
  cellEmpty: {
    english: "Row {row}, column {col}: empty",
    label: "An empty cell",
    group: "screenReader",
    fills: CELL,
    required: ["row", "col"],
    usedBy: (s) => !s.experiment && s.selectionMode !== "dropdown",
  },
  cellLabel: {
    english: "Row {row}, column {col}: {label}",
    label: "A filled cell",
    group: "screenReader",
    fills: { ...CELL, label: "the label in it" },
    required: ["row", "col", "label"],
    usedBy: (s) => !s.experiment && s.selectionMode !== "dropdown",
  },
  cellNoReaction: {
    english: "Row {row}, column {col}: {label}, no reaction yet",
    label: "A pre-filled cell without a reaction",
    group: "screenReader",
    fills: { ...CELL, label: "the pre-filled label" },
    required: ["row", "col", "label"],
    usedBy: (s) => s.experiment && s.selectionMode !== "dropdown",
  },
  cellReaction: {
    english: "Row {row}, column {col}: {label}, reaction {reaction}",
    label: "A pre-filled cell with a reaction",
    group: "screenReader",
    fills: { ...CELL, label: "the pre-filled label", reaction: "the reaction" },
    required: ["row", "col", "label", "reaction"],
    usedBy: (s) => s.experiment && s.selectionMode !== "dropdown",
  },
  dropdownName: {
    english: "Label for row {row}, column {col}",
    label: "Each dropdown",
    group: "screenReader",
    fills: CELL,
    required: ["row", "col"],
    usedBy: (s) => !s.experiment && s.selectionMode === "dropdown",
  },
  reactionDropdownName: {
    english: "Reaction to {label} in row {row}, column {col}",
    label: "Each dropdown",
    group: "screenReader",
    fills: { label: "the pre-filled label", ...CELL },
    required: ["label", "row", "col"],
    usedBy: (s) => s.experiment && s.selectionMode === "dropdown",
  },
  chipHelp: {
    english: "{label}. Select it to pick it up, then select a cell to place it.",
    label: "Each chip to drag",
    group: "screenReader",
    fills: { label: "the chip's text" },
    required: ["label"],
    usedBy: (s) => s.selectionMode === "dragdrop",
  },
  scrollLeft: {
    english: "Scroll the grid left",
    label: "Left arrow",
    group: "screenReader",
    usedBy: always,
  },
  scrollRight: {
    english: "Scroll the grid right",
    label: "Right arrow",
    group: "screenReader",
    usedBy: always,
  },
  scrollLeftEmptyOne: {
    english: "Scroll the grid left ({n} empty cell there)",
    label: "Left arrow, 1 cell still to answer past it",
    group: "screenReader",
    fills: PAST_ARROW,
    usedBy: checks,
  },
  scrollLeftEmptyOther: {
    english: "Scroll the grid left ({n} empty cells there)",
    label: "Left arrow, 2 or more cells still to answer past it",
    group: "screenReader",
    fills: PAST_ARROW,
    required: ["n"],
    usedBy: checks,
  },
  scrollRightEmptyOne: {
    english: "Scroll the grid right ({n} empty cell there)",
    label: "Right arrow, 1 cell still to answer past it",
    group: "screenReader",
    fills: PAST_ARROW,
    usedBy: checks,
  },
  scrollRightEmptyOther: {
    english: "Scroll the grid right ({n} empty cells there)",
    label: "Right arrow, 2 or more cells still to answer past it",
    group: "screenReader",
    fills: PAST_ARROW,
    required: ["n"],
    usedBy: checks,
  },
} satisfies Record<string, RespondentTextInfo>;

export type RespondentTextKey = keyof typeof TEXTS;

/** A grid's own wording, by text. Texts left out use GRIDDY's English. */
export type RespondentTexts = Partial<Record<RespondentTextKey, string>>;

export const RESPONDENT_TEXT_INFO: Readonly<Record<RespondentTextKey, RespondentTextInfo>> = TEXTS;

/** Every text, in the order the editor lists them. */
export const RESPONDENT_TEXT_KEYS = Object.keys(TEXTS) as RespondentTextKey[];

export const DEFAULT_RESPONDENT_TEXTS = Object.fromEntries(
  RESPONDENT_TEXT_KEYS.map((key) => [key, TEXTS[key].english]),
) as Record<RespondentTextKey, string>;

/** Whether a grid's text is wording of its own: an empty text, or one of
 * only spaces, keeps GRIDDY's English. */
export function hasOwnWording(text: unknown): text is string {
  return typeof text === "string" && text.trim() !== "";
}

/** Every text the script needs: the grid's own wording where it has some,
 * GRIDDY's English for the rest. */
export function respondentTextsFor(own: RespondentTexts | undefined): Record<RespondentTextKey, string> {
  const texts = { ...DEFAULT_RESPONDENT_TEXTS };
  if (!own) return texts;
  for (const key of RESPONDENT_TEXT_KEYS) {
    const text = own[key];
    if (hasOwnWording(text)) texts[key] = text;
  }
  return texts;
}

const isKnown = (key: string, table: object) => Object.prototype.hasOwnProperty.call(table, key);

/** A saved grid's own wording with only what the export can use: known
 * texts with wording of their own, in the order the editor lists them, so
 * the same wording is always stored the same way. Returns `value` itself
 * when nothing needs dropping or moving, and undefined when nothing is
 * left. */
export function cleanRespondentTexts(value: unknown): RespondentTexts | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const texts = value as Record<string, unknown>;
  const usable = RESPONDENT_TEXT_KEYS.filter((key) => isKnown(key, texts) && hasOwnWording(texts[key]));
  if (usable.length === 0) return undefined;
  const keys = Object.keys(texts);
  if (keys.length === usable.length && keys.every((key, i) => key === usable[i])) return value as RespondentTexts;
  return Object.fromEntries(usable.map((key) => [key, texts[key]])) as RespondentTexts;
}

/** How a grid is answered, read the way the exported script reads it. */
export function respondentTextSetup(config: GridConfig): RespondentTextSetup {
  const skip = config.survey.skipBehavior;
  const experiment = !!config.experimental?.enabled;
  // Whether a list of names has one, split the way the script splits it.
  const hasNames = (csv?: string) => (csv ?? "").split(",").some((name) => name.trim() !== "");
  return {
    selectionMode: config.survey.selectionMode ?? "paint",
    experiment,
    skipBehavior: skip === "allow" || skip === "force" ? skip : "remind",
    answerable: experiment
      ? hasNames(config.experimental?.responseLabelsCsv)
      : !!config.survey.allowInteraction && hasNames(config.survey.categoriesCsv),
    dropdownsDrawn: !experiment && !!config.survey.allowInteraction,
  };
}

/** What a grid respondents cannot answer still shows: the scroll hint and
 * the arrows, and the dropdowns it draws. */
const SCROLL_KEYS: readonly RespondentTextKey[] = ["scrollHint", "scrollLeft", "scrollRight"];
const DROPDOWN_KEYS: readonly RespondentTextKey[] = ["chooseLabel", "dropdownName"];

/** The texts respondents can meet in a grid set up this way, in order. A
 * grid they cannot answer (no labels or interaction off, or an experiment
 * without reaction labels) has no toolbar, tray, reminder or Next of its own
 * and no cell a screen reader describes, so it only shows the scroll hint
 * and the arrows, and its dropdowns if it draws them. */
export function respondentTextKeysFor(setup: RespondentTextSetup): RespondentTextKey[] {
  return RESPONDENT_TEXT_KEYS.filter(
    (key) =>
      TEXTS[key].usedBy(setup) &&
      (setup.answerable !== false ||
        SCROLL_KEYS.includes(key) ||
        (setup.dropdownsDrawn !== false && DROPDOWN_KEYS.includes(key))),
  );
}

/** The placeholders `text` needs but has lost, such as {n}. */
export function missingPlaceholders(key: RespondentTextKey, text: string): Placeholder[] {
  const required: readonly Placeholder[] = RESPONDENT_TEXT_INFO[key].required ?? [];
  return required.filter((name) => !text.includes(`{${name}}`));
}

/** Placeholders written in `text` that the script does not fill in for this
 * text, so respondents would see them as typed. */
export function unknownPlaceholders(key: RespondentTextKey, text: string): string[] {
  const fills = RESPONDENT_TEXT_INFO[key].fills ?? {};
  const written = (text.match(/\{[A-Za-z]+\}/g) ?? []).map((p) => p.slice(1, -1));
  return [...new Set(written)].filter((name) => !isKnown(name, fills));
}
