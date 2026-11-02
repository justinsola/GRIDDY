import { describe, expect, it } from "vitest";
import type { GridConfig } from "../grid-types";
import {
  cleanRespondentTexts,
  DEFAULT_RESPONDENT_TEXTS,
  missingPlaceholders,
  RESPONDENT_TEXT_INFO,
  RESPONDENT_TEXT_KEYS,
  respondentTextKeysFor,
  respondentTextSetup,
  unknownPlaceholders,
  type RespondentTextSetup,
} from "./respondentTexts";

const setup = (patch: Partial<RespondentTextSetup> = {}): RespondentTextSetup => ({
  selectionMode: "paint",
  experiment: false,
  skipBehavior: "remind",
  ...patch,
});

/** A grid with labels and interaction on, answered by painting, with the
 * reminder on; an experiment when `experimental` is given. */
function grid(
  survey: Partial<GridConfig["survey"]> = {},
  experimental?: Partial<NonNullable<GridConfig["experimental"]>>,
): GridConfig {
  return {
    id: "texts-test",
    name: "Texts test",
    layout: {
      questionText: "Who lives where?",
      rows: 3,
      cols: 3,
      includeCenterCell: true,
      centerCellLabel: "Your House",
      centerRow: null,
      centerCol: null,
      backgroundImageUrl: "",
      barriersCsv: "",
      barrierMeta: {},
      blockedCells: {},
    },
    tuning: {
      gridGap: 10,
      gridPadding: 0,
      labelFontSizeRem: 1,
      cellWidth: 100,
      cellHeight: 120,
      previewWidth: 550,
      previewHeight: 550,
    },
    survey: {
      categoriesCsv: "Family, Friends",
      allowInteraction: true,
      selectionMode: "paint",
      skipBehavior: "remind",
      advancedCategories: false,
      categoryMeta: {},
      ...survey,
    },
    experimental: {
      enabled: !!experimental,
      prefillMode: "fixed",
      fixedAssignments: { "r1-c1": "Family" },
      weightedEntries: [],
      responseLabelsCsv: "Agree, Disagree",
      responseLabelMeta: {},
      ...experimental,
    },
  };
}

const textsFor = (config: GridConfig) => respondentTextKeysFor(respondentTextSetup(config));
const SCROLLING = ["scrollHint", "scrollLeft", "scrollRight"];

describe("GRIDDY's English texts", () => {
  it("keep every placeholder they need and use only ones the script fills in", () => {
    for (const key of RESPONDENT_TEXT_KEYS) {
      expect(missingPlaceholders(key, DEFAULT_RESPONDENT_TEXTS[key]), key).toEqual([]);
      expect(unknownPlaceholders(key, DEFAULT_RESPONDENT_TEXTS[key]), key).toEqual([]);
    }
  });

  it("come in pairs, one for 1 and one for more, wherever a count appears", () => {
    for (const key of RESPONDENT_TEXT_KEYS.filter((k) => k.endsWith("One"))) {
      const other = key.replace(/One$/, "Other") as keyof typeof RESPONDENT_TEXT_INFO;
      expect(RESPONDENT_TEXT_INFO[other], key).toBeDefined();
      expect(RESPONDENT_TEXT_INFO[other].usedBy(setup()), key).toBe(RESPONDENT_TEXT_INFO[key].usedBy(setup()));
    }
  });
});

describe("which texts a grid uses", () => {
  it("follows the answer mode, the experiment and the empty-cell setting", () => {
    expect(respondentTextKeysFor(setup())).toEqual(
      expect.arrayContaining(["placing", "next", "continueAnyway", "emptyOther", "remindFillOther", "cellLabel"]),
    );
    expect(respondentTextKeysFor(setup())).not.toContain("requireFill");
    expect(respondentTextKeysFor(setup({ skipBehavior: "force" }))).not.toContain("continueAnyway");
    expect(respondentTextKeysFor(setup({ skipBehavior: "allow" }))).toEqual([
      "placing",
      "scrollHint",
      "cellEmpty",
      "cellLabel",
      "scrollLeft",
      "scrollRight",
    ]);
    const reactions = respondentTextKeysFor(setup({ experiment: true, selectionMode: "dropdown" }));
    expect(reactions).toEqual(expect.arrayContaining(["chooseReaction", "reactionDropdownName", "unreactedOther"]));
    expect(reactions).not.toContain("chooseLabel");
    expect(reactions).not.toContain("cellNoReaction");
  });

  it("reads a grid the way its script does", () => {
    expect(textsFor(grid())).toEqual(respondentTextKeysFor(setup()));
    expect(respondentTextSetup(grid())).toMatchObject({ answerable: true, dropdownsDrawn: true });
    expect(respondentTextSetup(grid({}, {}))).toMatchObject({
      experiment: true,
      answerable: true,
      dropdownsDrawn: false,
    });
  });

  it("lists only the scroll hint and the arrows for a grid respondents only look at", () => {
    // Interaction off, or no labels to place: no toolbar, reminder or Next.
    expect(textsFor(grid({ allowInteraction: false }))).toEqual(SCROLLING);
    expect(textsFor(grid({ categoriesCsv: "" }))).toEqual(SCROLLING);
    expect(textsFor(grid({ categoriesCsv: " , ", selectionMode: "dragdrop", skipBehavior: "force" }))).toEqual(
      SCROLLING,
    );
    expect(textsFor(grid({ allowInteraction: false, selectionMode: "dropdown" }))).toEqual(SCROLLING);
  });

  it("lists only the scroll hint and the arrows for an experiment without reaction labels", () => {
    for (const selectionMode of ["paint", "dragdrop", "dropdown"] as const) {
      expect(textsFor(grid({ selectionMode }, { responseLabelsCsv: "" })), selectionMode).toEqual(SCROLLING);
    }
    // Interaction off does not stop respondents reacting.
    expect(textsFor(grid({ allowInteraction: false }, {}))).toContain("reacting");
  });

  it("keeps the dropdowns a grid draws before it has labels", () => {
    expect(textsFor(grid({ categoriesCsv: "", selectionMode: "dropdown" }))).toEqual([
      "chooseLabel",
      "scrollHint",
      "dropdownName",
      "scrollLeft",
      "scrollRight",
    ]);
  });
});

describe("the arrows' counts", () => {
  it("are named for cells still to answer, which in an experiment are pre-filled cells without a reaction", () => {
    const arrows = [
      "scrollLeftEmptyOne",
      "scrollLeftEmptyOther",
      "scrollRightEmptyOne",
      "scrollRightEmptyOther",
    ] as const;
    expect(arrows.map((key) => RESPONDENT_TEXT_INFO[key].label)).toEqual([
      "Left arrow, 1 cell still to answer past it",
      "Left arrow, 2 or more cells still to answer past it",
      "Right arrow, 1 cell still to answer past it",
      "Right arrow, 2 or more cells still to answer past it",
    ]);
    for (const key of arrows) {
      expect(RESPONDENT_TEXT_INFO[key].fills, key).toEqual({ n: "the number of cells past the arrow still to answer" });
    }
    expect(respondentTextKeysFor(setup({ experiment: true }))).toEqual(expect.arrayContaining([...arrows]));
  });
});

describe("placeholder checks", () => {
  it("name the placeholders a text has lost, and the ones it cannot use", () => {
    expect(missingPlaceholders("cellLabel", "Fila {row}: {label}")).toEqual(["col"]);
    expect(missingPlaceholders("emptyOne", "Queda una celda vacía.")).toEqual([]);
    expect(unknownPlaceholders("emptyOther", "{n} celdas, {off} fuera, {n}")).toEqual(["off"]);
    expect(unknownPlaceholders("emptySomeOffscreenOther", "{n} celdas, {off} fuera")).toEqual([]);
  });
});

describe("cleanRespondentTexts", () => {
  it("returns the same wording when there is nothing to drop or move", () => {
    const texts = { next: "Siguiente" };
    expect(cleanRespondentTexts(texts)).toBe(texts);
    const two = { placing: "Colocar:", next: "Siguiente" };
    expect(cleanRespondentTexts(two)).toBe(two);
    expect(cleanRespondentTexts(undefined)).toBeUndefined();
  });

  it("keeps the texts in the editor's order, so the same wording is stored the same way", () => {
    const cleaned = cleanRespondentTexts({ next: "Siguiente", unknown: "?", showMe: " ", placing: "Colocar:" });
    expect(cleaned).toEqual({ placing: "Colocar:", next: "Siguiente" });
    expect(Object.keys(cleaned!)).toEqual(["placing", "next"]);
    expect(Object.keys(cleanRespondentTexts({ next: "Siguiente", placing: "Colocar:" })!)).toEqual(["placing", "next"]);
  });
});
