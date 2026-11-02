import { describe, it, expect } from "vitest";
import {
  syncCategoryMeta,
  editorReducer,
  normalizeConfig,
  hasUnsavedChanges,
  encodeNamesCsv,
  splitCsvPreservingBlanks,
} from "./EditorContext";
import type { GridConfig, TuningConfig } from "./grid-types";
import { defaultTuning, gridPixelSize } from "./lib/gridSize";
import type { RespondentTexts } from "./lib/respondentTexts";

// ─── encodeNamesCsv / splitCsvPreservingBlanks ─────────────────────────────────

describe("encodeNamesCsv / splitCsvPreservingBlanks round trip", () => {
  it("round-trips zero items", () => {
    expect(encodeNamesCsv([])).toBe("");
    expect(splitCsvPreservingBlanks(encodeNamesCsv([]))).toEqual([]);
  });

  it("round-trips a single blank item distinctly from zero items", () => {
    const csv = encodeNamesCsv([""]);
    expect(csv).not.toBe(""); // must differ from the zero-items encoding
    expect(splitCsvPreservingBlanks(csv)).toEqual([""]);
  });

  it("round-trips normal multi-item lists", () => {
    const csv = encodeNamesCsv(["Wall", "Road"]);
    expect(splitCsvPreservingBlanks(csv)).toEqual(["Wall", "Road"]);
  });

  it("round-trips a blank item alongside real ones", () => {
    const csv = encodeNamesCsv(["Wall", "", "Road"]);
    expect(splitCsvPreservingBlanks(csv)).toEqual(["Wall", "", "Road"]);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PALETTE_FIRST = "#f87171"; // first color in CATEGORY_PALETTE

function makeBaseConfig(): GridConfig {
  return {
    id: "base-id",
    name: "Base",
    layout: {
      questionText: "Q",
      rows: 2,
      cols: 2,
      includeCenterCell: false,
      centerCellLabel: "",
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
      cellHeight: 100,
      previewWidth: 400,
      previewHeight: 400,
    },
    survey: {
      categoriesCsv: "A, B",
      allowInteraction: true,
      selectionMode: "paint",
      advancedCategories: false,
      categoryMeta: {},
    },
    experimental: {
      enabled: false,
      prefillMode: "fixed",
      fixedAssignments: {},
      weightedEntries: [],
      responseLabelsCsv: "",
      responseLabelMeta: {},
    },
  };
}

function makeState(config?: GridConfig) {
  const c = config ?? makeBaseConfig();
  return { config: c, savedSurveyId: null, savedSnapshot: JSON.stringify(c), savedRecord: null };
}

const SAVED_AT = "2026-11-01T12:00:00.000Z";

// ─── syncCategoryMeta ─────────────────────────────────────────────────────────

describe("syncCategoryMeta", () => {
  it("assigns palette colors to new categories", () => {
    const result = syncCategoryMeta("Red, Blue", {});
    expect(Object.keys(result)).toEqual(["Red", "Blue"]);
    expect(result["Red"].color).toBe(PALETTE_FIRST);
    expect(result["Blue"].color).not.toBe(PALETTE_FIRST);
  });

  it("preserves existing category colors", () => {
    const existing = { Cat: { color: "#abcdef", imageUrl: "" } };
    const result = syncCategoryMeta("Cat, Dog", existing);
    expect(result["Cat"].color).toBe("#abcdef");
  });

  it("drops categories removed from the CSV", () => {
    const existing = { A: { color: "#111111", imageUrl: "" }, B: { color: "#222222", imageUrl: "" } };
    const result = syncCategoryMeta("A", existing);
    expect(Object.keys(result)).toEqual(["A"]);
    expect(result["B"]).toBeUndefined();
  });

  it("returns an empty object for an empty CSV", () => {
    const result = syncCategoryMeta("", {});
    expect(result).toEqual({});
  });

  it("strips only the single leading space added by the \", \" join", () => {
    const result = syncCategoryMeta("Alpha, Beta, New ", {});
    expect(Object.keys(result)).toEqual(["Alpha", "Beta", "New "]);
  });

  it("preserves a blank token instead of dropping it (mid-edit: retyping a name)", () => {
    const result = syncCategoryMeta("A,,B,", {});
    expect(Object.keys(result)).toEqual(["A", "", "B"]);
  });

  it("treats a fully empty/whitespace CSV as zero entries", () => {
    expect(syncCategoryMeta("", {})).toEqual({});
    expect(syncCategoryMeta("   ", {})).toEqual({});
  });

  it("does not assign a color already in use to a new category", () => {
    const existing = {
      A: { color: PALETTE_FIRST, imageUrl: "" },
    };
    const result = syncCategoryMeta("A, B", existing);
    expect(result["B"].color).not.toBe(PALETTE_FIRST);
  });

  it("keeps a category's color while its name is temporarily blank mid-retype", () => {
    // Simulates deleting the last letter of "Cat" (leaving "A,,B") then
    // retyping it back to "Cat" — the color should survive the round trip
    // instead of being reset by a fresh palette pick.
    const withCat = syncCategoryMeta("A, Cat, B", {});
    const catColor = withCat["Cat"].color;

    const midEdit = syncCategoryMeta("A,,B", withCat);
    expect(midEdit[""]).toBeDefined();

    const retyped = syncCategoryMeta("A, Cat, B", midEdit);
    expect(retyped["Cat"].color).toBe(catColor);
  });
});

// ─── editorReducer ────────────────────────────────────────────────────────────

describe("editorReducer", () => {
  it("setConfig: replaces config and runs normalizeConfig", () => {
    const next = makeBaseConfig();
    next.survey.categoriesCsv = "X, Y";
    const state = editorReducer(makeState(), { type: "setConfig", config: next });
    expect(state.config.survey.categoriesCsv).toBe("X, Y");
    // normalizeConfig should have populated categoryMeta
    expect(Object.keys(state.config.survey.categoryMeta)).toEqual(["X", "Y"]);
  });

  it("markSaved: sets savedSurveyId to current config id", () => {
    const state = editorReducer(makeState(), {
      type: "markSaved",
      record: { id: "base-id", updated_at: SAVED_AT },
    });
    expect(state.savedSurveyId).toBe("base-id");
  });

  it("newSurvey: resets savedSurveyId to null and creates fresh config", () => {
    const state = editorReducer(
      { ...makeState(), savedSurveyId: "old-id" },
      { type: "newSurvey" },
    );
    expect(state.savedSurveyId).toBeNull();
    expect(state.config.id).not.toBe("base-id");
  });

  it("updateLayout: merges layout patch", () => {
    const state = editorReducer(makeState(), {
      type: "updateLayout",
      patch: { rows: 5 },
    });
    expect(state.config.layout.rows).toBe(5);
    expect(state.config.layout.cols).toBe(2); // unchanged
  });

  it("updateLayout: syncs barrierMeta when barriersCsv changes", () => {
    const state = editorReducer(makeState(), {
      type: "updateLayout",
      patch: { barriersCsv: "Wall, Road" },
    });
    expect(Object.keys(state.config.layout.barrierMeta)).toEqual([
      "Wall",
      "Road",
    ]);
  });

  it("updateLayout: prunes blockedCells for removed barrier types", () => {
    const config = makeBaseConfig();
    config.layout.barriersCsv = "Wall, Road";
    config.layout.blockedCells = { "r1-c1": "Wall", "r1-c2": "Road" };
    const state = editorReducer(makeState(config), {
      type: "updateLayout",
      patch: { barriersCsv: "Wall" }, // Road removed
    });
    expect(state.config.layout.blockedCells).toEqual({ "r1-c1": "Wall" });
  });

  it("updateLayout: remaps blockedCells onto a renamed barrier instead of dropping them", () => {
    const config = makeBaseConfig();
    config.layout.barriersCsv = "Wall, Road";
    config.layout.blockedCells = { "r1-c1": "Wall", "r1-c2": "Road" };
    const state = editorReducer(makeState(config), {
      type: "updateLayout",
      patch: { barriersCsv: "Fence, Road" }, // "Wall" renamed to "Fence"
    });
    expect(state.config.layout.blockedCells).toEqual({
      "r1-c1": "Fence",
      "r1-c2": "Road",
    });
  });

  it("updateLayout: keeps blockedCells when the only barrier's name is cleared to blank", () => {
    // Regression: a single barrier's name join()-ing to "" is indistinguishable
    // from zero barriers unless the editor uses the "," sentinel from
    // encodeNamesCsv — this simulates that encoded patch.
    const config = makeBaseConfig();
    config.layout.barriersCsv = "Wall";
    config.layout.blockedCells = { "r1-c1": "Wall" };
    const state = editorReducer(makeState(config), {
      type: "updateLayout",
      patch: { barriersCsv: "," }, // "Wall" cleared to blank (sentinel-encoded)
    });
    expect(state.config.layout.blockedCells).toEqual({ "r1-c1": "" });
    expect(Object.keys(state.config.layout.barrierMeta)).toEqual([""]);
  });

  it("updateLayout: remaps blockedCells when an unnamed barrier is renamed", () => {
    const config = makeBaseConfig();
    config.layout.barriersCsv = ", Road";
    config.layout.blockedCells = { "r1-c1": "", "r1-c2": "Road" };
    const state = editorReducer(makeState(config), {
      type: "updateLayout",
      patch: { barriersCsv: "Wall, Road" }, // unnamed barrier renamed to "Wall"
    });
    expect(state.config.layout.blockedCells).toEqual({
      "r1-c1": "Wall",
      "r1-c2": "Road",
    });
  });

  it("updateTuning: merges tuning patch", () => {
    const state = editorReducer(makeState(), {
      type: "updateTuning",
      patch: { cellWidth: 200 },
    });
    expect(state.config.tuning.cellWidth).toBe(200);
    expect(state.config.tuning.cellHeight).toBe(100); // unchanged
  });

  it("updateSurvey: merges survey patch without pruning when no CSV change", () => {
    const state = editorReducer(makeState(), {
      type: "updateSurvey",
      patch: { allowInteraction: false },
    });
    expect(state.config.survey.allowInteraction).toBe(false);
    expect(state.config.survey.categoriesCsv).toBe("A, B");
  });

  it("updateSurvey: prunes fixedAssignments for removed categories", () => {
    const config = makeBaseConfig();
    config.experimental!.fixedAssignments = { cell1: "A", cell2: "B" };
    const state = editorReducer(makeState(config), {
      type: "updateSurvey",
      patch: { categoriesCsv: "A" }, // B removed
    });
    expect(state.config.experimental!.fixedAssignments).toEqual({ cell1: "A" });
  });

  it("updateSurvey: prunes weightedEntries for removed categories", () => {
    const config = makeBaseConfig();
    config.experimental!.weightedEntries = [
      { category: "A", weight: 1 },
      { category: "B", weight: 2 },
    ];
    const state = editorReducer(makeState(config), {
      type: "updateSurvey",
      patch: { categoriesCsv: "A" },
    });
    expect(state.config.experimental!.weightedEntries).toEqual([
      { category: "A", weight: 1 },
    ]);
  });

  it("updateSurvey: remaps fixedAssignments/weightedEntries onto a renamed category", () => {
    const config = makeBaseConfig();
    config.experimental!.fixedAssignments = { cell1: "A", cell2: "B" };
    config.experimental!.weightedEntries = [
      { category: "A", weight: 1 },
      { category: "B", weight: 2 },
    ];
    const state = editorReducer(makeState(config), {
      type: "updateSurvey",
      patch: { categoriesCsv: "Alpha, B" }, // "A" renamed to "Alpha"
    });
    expect(state.config.experimental!.fixedAssignments).toEqual({
      cell1: "Alpha",
      cell2: "B",
    });
    expect(state.config.experimental!.weightedEntries).toEqual([
      { category: "Alpha", weight: 1 },
      { category: "B", weight: 2 },
    ]);
  });

  it("updateExperimental: merges experimental patch", () => {
    const state = editorReducer(makeState(), {
      type: "updateExperimental",
      patch: { enabled: true },
    });
    expect(state.config.experimental!.enabled).toBe(true);
    expect(state.config.experimental!.prefillMode).toBe("fixed"); // unchanged
  });
});

// ─── normalizeConfig ──────────────────────────────────────────────────────────

describe("normalizeConfig", () => {
  it("fills in missing selectionMode with 'paint'", () => {
    const config = makeBaseConfig();
    // @ts-expect-error intentionally removing field
    delete config.survey.selectionMode;
    const result = normalizeConfig(config);
    expect(result.survey.selectionMode).toBe("paint");
  });

  it("syncs categoryMeta from categoriesCsv", () => {
    const config = makeBaseConfig();
    config.survey.categoriesCsv = "Dogs, Cats";
    config.survey.categoryMeta = {};
    const result = normalizeConfig(config);
    expect(Object.keys(result.survey.categoryMeta)).toEqual(["Dogs", "Cats"]);
  });

  it("defaults new barrier layout fields for older configs", () => {
    const config = makeBaseConfig();
    // Simulate an older saved survey lacking the barrier fields.
    // @ts-expect-error intentionally removing fields
    delete config.layout.barriersCsv;
    // @ts-expect-error intentionally removing fields
    delete config.layout.barrierMeta;
    // @ts-expect-error intentionally removing fields
    delete config.layout.blockedCells;
    const result = normalizeConfig(config);
    expect(result.layout.barriersCsv).toBe("");
    expect(result.layout.barrierMeta).toEqual({});
    expect(result.layout.blockedCells).toEqual({});
  });

  it("syncs barrierMeta from barriersCsv", () => {
    const config = makeBaseConfig();
    config.layout.barriersCsv = "Wall, Road";
    config.layout.barrierMeta = {};
    const result = normalizeConfig(config);
    expect(Object.keys(result.layout.barrierMeta)).toEqual(["Wall", "Road"]);
  });

  it("fills in missing experimental fields with defaults", () => {
    const config = makeBaseConfig();
    delete config.experimental;
    const result = normalizeConfig(config);
    expect(result.experimental).toMatchObject({
      enabled: false,
      prefillMode: "fixed",
      fixedAssignments: {},
      weightedEntries: [],
    });
  });
});

// ─── Skip behaviour ─────────────────────────────────────────────────────────────

describe("skip behaviour (what happens when cells are left empty)", () => {
  it("treats surveys saved before the setting existed as remind", () => {
    expect(normalizeConfig(makeBaseConfig()).survey.skipBehavior).toBe("remind");
  });

  it("keeps the researcher's choice", () => {
    const config = makeBaseConfig();
    config.survey.skipBehavior = "force";
    expect(normalizeConfig(config).survey.skipBehavior).toBe("force");
  });
});

// ─── Unsaved changes ──────────────────────────────────────────────────────────

describe("unsaved changes", () => {
  it("is clean when a survey is started or saved, and dirty after an edit", () => {
    let state = editorReducer(makeState(), { type: "newSurvey" });
    expect(hasUnsavedChanges(state)).toBe(false);
    state = editorReducer(state, { type: "updateLayout", patch: { rows: 5 } });
    expect(hasUnsavedChanges(state)).toBe(true);
    state = editorReducer(state, {
      type: "markSaved",
      record: { id: state.config.id, updated_at: SAVED_AT },
    });
    expect(hasUnsavedChanges(state)).toBe(false);
  });

  it("counts a renamed survey as an unsaved edit", () => {
    // Start from a config normalizeConfig leaves as it is, so that only the
    // rename can make the survey differ from its snapshot.
    const state = makeState(normalizeConfig(makeBaseConfig()));
    const unchanged = editorReducer(state, { type: "setConfig", config: state.config });
    expect(hasUnsavedChanges(unchanged)).toBe(false);
    const renamed = editorReducer(state, {
      type: "setConfig",
      config: { ...state.config, name: "Renamed" },
    });
    expect(hasUnsavedChanges(renamed)).toBe(true);
  });
});

// ─── The saved record, to ask before replacing a saved survey ─────────────────

describe("saved record", () => {
  it("remembers the survey's id, its name then and when it was stored", () => {
    const state = editorReducer(makeState(), {
      type: "markSaved",
      record: { id: "base-id", updated_at: SAVED_AT },
    });
    expect(state.savedRecord).toEqual({ id: "base-id", name: "Base", updated_at: SAVED_AT });
  });

  it("keeps the name it was saved with when the survey is renamed", () => {
    let state = editorReducer(makeState(), {
      type: "markSaved",
      record: { id: "base-id", updated_at: SAVED_AT },
    });
    state = editorReducer(state, { type: "setConfig", config: { ...state.config, name: "Base v2" } });
    expect(state.config.name).toBe("Base v2");
    expect(state.savedRecord?.name).toBe("Base");
  });

  it("gives a survey saved as a new one the new id, and counts it as saved", () => {
    let state = editorReducer(makeState(normalizeConfig(makeBaseConfig())), {
      type: "updateLayout",
      patch: { rows: 4 },
    });
    state = editorReducer(state, { type: "markSaved", record: { id: "copy-id", updated_at: SAVED_AT } });
    expect(state.config.id).toBe("copy-id");
    expect(state.config.layout.rows).toBe(4);
    expect(state.savedSurveyId).toBe("copy-id");
    expect(state.savedRecord).toEqual({ id: "copy-id", name: "Base", updated_at: SAVED_AT });
    expect(hasUnsavedChanges(state)).toBe(false);
  });

  it("is forgotten by New", () => {
    const saved = editorReducer(makeState(), {
      type: "markSaved",
      record: { id: "base-id", updated_at: SAVED_AT },
    });
    expect(editorReducer(saved, { type: "newSurvey" }).savedRecord).toBeNull();
  });
});

// ─── normalizeConfig: repairs for surveys saved by older versions ─────────────

describe("normalizeConfig repairs older saves", () => {
  function olderSave(): GridConfig {
    const base = makeBaseConfig();
    return {
      ...base,
      layout: {
        ...base.layout,
        rows: 0,
        cols: 2.4,
        barriersCsv: "Wall ",
        barrierMeta: { "Wall ": { color: "#123456", imageUrl: "" } },
        blockedCells: { "r1-c1": "Wall " },
      },
      survey: {
        ...base.survey,
        categoriesCsv: "Friends , Family",
        categoryMeta: {
          "Friends ": { color: "#abcdef", imageUrl: "friends.png" },
          Family: { color: "#111111", imageUrl: "" },
        },
      },
      experimental: {
        ...base.experimental!,
        fixedAssignments: { "r1-c2": "Friends " },
        weightedEntries: [{ category: "Friends ", weight: 2 }],
        responseLabelsCsv: "Agree , Disagree",
        responseLabelMeta: { "Agree ": { color: "#00aa00", imageUrl: "" } },
      },
    };
  }

  it("trims label names and keeps their colour, image, cells and weights", () => {
    const out = normalizeConfig(olderSave());
    expect(out.survey.categoriesCsv).toBe("Friends, Family");
    expect(out.survey.categoryMeta.Friends).toEqual({ color: "#abcdef", imageUrl: "friends.png" });
    expect(out.survey.categoryMeta["Friends "]).toBeUndefined();
    expect(out.layout.barriersCsv).toBe("Wall");
    expect(out.layout.barrierMeta.Wall.color).toBe("#123456");
    expect(out.layout.blockedCells).toEqual({ "r1-c1": "Wall" });
    expect(out.experimental!.fixedAssignments).toEqual({ "r1-c2": "Friends" });
    expect(out.experimental!.weightedEntries).toEqual([{ category: "Friends", weight: 2 }]);
    expect(out.experimental!.responseLabelsCsv).toBe("Agree, Disagree");
    expect(out.experimental!.responseLabelMeta.Agree.color).toBe("#00aa00");
  });

  it("keeps the trimmed label's cells through the next edit of the list", () => {
    const state = editorReducer(makeState(normalizeConfig(olderSave())), {
      type: "updateSurvey",
      patch: { categoriesCsv: "Friends, Family, Neighbors" },
    });
    expect(state.config.experimental!.fixedAssignments).toEqual({ "r1-c2": "Friends" });
    expect(state.config.experimental!.weightedEntries).toEqual([{ category: "Friends", weight: 2 }]);
  });

  it("drops a label that becomes a copy of an earlier one once trimmed", () => {
    const base = makeBaseConfig();
    const out = normalizeConfig({
      ...base,
      survey: {
        ...base.survey,
        categoriesCsv: "Friends, Friends ",
        categoryMeta: {
          Friends: { color: "#abcdef", imageUrl: "" },
          "Friends ": { color: "#222222", imageUrl: "" },
        },
      },
    });
    expect(out.survey.categoriesCsv).toBe("Friends");
    expect(out.survey.categoryMeta).toEqual({ Friends: { color: "#abcdef", imageUrl: "" } });
  });

  it("repairs a grid size of 0, a negative number or a decimal", () => {
    const out = normalizeConfig(olderSave());
    expect(out.layout.rows).toBe(1);
    expect(out.layout.cols).toBe(2);
  });

  it("changes nothing in a survey that needs no repair", () => {
    const once = normalizeConfig(makeBaseConfig());
    expect(normalizeConfig(once)).toEqual(once);
    expect(once.layout.rows).toBe(2);
    expect(once.survey.categoriesCsv).toBe("A, B");
  });
});

// ─── normalizeConfig: the grid's own words for respondents ────────────────────

describe("normalizeConfig and the words shown to respondents", () => {
  function withTexts(respondentTexts: unknown): GridConfig {
    const base = makeBaseConfig();
    return { ...base, survey: { ...base.survey, respondentTexts: respondentTexts as RespondentTexts } };
  }

  it("keeps the wording a researcher wrote", () => {
    const texts = { next: "Siguiente", emptyOther: "Quedan {n} celdas vacías." };
    const config = withTexts(texts);
    expect(normalizeConfig(config).survey.respondentTexts).toBe(texts);
    expect(editorReducer(makeState(), { type: "setConfig", config }).config.survey.respondentTexts).toEqual(texts);
  });

  it("drops unknown texts, values that are not text and texts left empty", () => {
    const out = normalizeConfig(
      withTexts({ next: "Siguiente", nextButton: "Weiter", showMe: 3, placing: "   ", scrollHint: "", toString: "x" }),
    );
    expect(out.survey.respondentTexts).toEqual({ next: "Siguiente" });
  });

  it("drops wording that is not a set of texts", () => {
    for (const junk of ["Siguiente", ["Siguiente"], null, 7, {}]) {
      expect(normalizeConfig(withTexts(junk)).survey.respondentTexts).toBeUndefined();
    }
  });

  it("leaves a survey saved without its own wording as it was", () => {
    const out = normalizeConfig(makeBaseConfig());
    expect("respondentTexts" in out.survey).toBe(false);
    expect(JSON.stringify(normalizeConfig(out))).toBe(JSON.stringify(out));
  });

  it("changes nothing the second time", () => {
    const once = normalizeConfig(withTexts({ next: "Siguiente", junk: "x" }));
    expect(normalizeConfig(once)).toEqual(once);
    expect(JSON.stringify(normalizeConfig(once))).toBe(JSON.stringify(once));
  });
});

// ─── The grid's size: cells instead of a fixed frame ──────────────────────────

describe("the grid's size comes from its cells", () => {
  /** A survey as saved before November 2026: its grid filled a fixed frame
   * of 550 × 550 px, and the cell sizes it stored were not used. */
  function savedBefore(rows: number, cols: number, tuning: Partial<TuningConfig> = {}): GridConfig {
    const base = makeBaseConfig();
    return {
      ...base,
      layout: { ...base.layout, rows, cols },
      tuning: {
        gridGap: 10,
        gridPadding: 0,
        labelFontSizeRem: 1,
        cellWidth: 100,
        cellHeight: 120,
        previewWidth: 550,
        previewHeight: 550,
        ...tuning,
      },
    };
  }

  it("gives a new survey cells of 90 × 90 px, so its 3 × 3 grid is 290 × 290 px", () => {
    const { config } = editorReducer(makeState(), { type: "newSurvey" });
    expect(config.tuning).toEqual(defaultTuning());
    expect(config.tuning).toMatchObject({ cellWidth: 90, cellHeight: 90, sizing: "cells" });
    expect("previewWidth" in config.tuning).toBe(false);
    expect(gridPixelSize(config)).toEqual({ width: 290, height: 290 });
  });

  it("keeps the exact pixel size of a survey saved with a fixed frame", () => {
    for (const [rows, cols] of [[3, 3], [10, 10], [2, 5], [4, 7]]) {
      const out = normalizeConfig(savedBefore(rows, cols));
      expect(out.tuning.sizing).toBe("cells");
      expect(gridPixelSize(out)).toEqual({ width: 550, height: 550 });
    }
    // Each cell gets its share of the frame, unrounded.
    expect(normalizeConfig(savedBefore(3, 3)).tuning).toMatchObject({ cellWidth: 530 / 3, cellHeight: 530 / 3 });
    expect(normalizeConfig(savedBefore(10, 10)).tuning).toMatchObject({ cellWidth: 46, cellHeight: 46 });
    expect(normalizeConfig(savedBefore(2, 5)).tuning).toMatchObject({ cellWidth: 102, cellHeight: 270 });
  });

  it("keeps the pixel size with another gap, padding or frame", () => {
    const out = normalizeConfig(
      savedBefore(3, 4, { gridGap: 4, gridPadding: 8, previewWidth: 360, previewHeight: 300 }),
    );
    expect(out.tuning).toMatchObject({ gridGap: 4, gridPadding: 8, cellWidth: 83, cellHeight: 92 });
    expect(gridPixelSize(out)).toEqual({ width: 360, height: 300 });
  });

  it("drops the fixed frame and changes nothing the second time", () => {
    const once = normalizeConfig(savedBefore(3, 3));
    expect("previewWidth" in once.tuning).toBe(false);
    expect("previewHeight" in once.tuning).toBe(false);
    expect(normalizeConfig(once)).toEqual(once);
    expect(JSON.stringify(normalizeConfig(once))).toBe(JSON.stringify(once));
    expect(normalizeConfig(once).tuning).toBe(once.tuning);
  });

  it("uses a new survey's sizes for numbers that are missing or unusable", () => {
    for (const frame of [undefined, Number.NaN, 0, -550, "550"]) {
      const out = normalizeConfig(savedBefore(3, 3, { previewWidth: frame as number, previewHeight: frame as number }));
      expect(out.tuning).toMatchObject({ cellWidth: 90, cellHeight: 90, sizing: "cells" });
    }
    const repaired = normalizeConfig({
      ...makeBaseConfig(),
      tuning: { ...defaultTuning(), cellWidth: Number.NaN, gridGap: -1 },
    });
    expect(repaired.tuning).toMatchObject({ cellWidth: 90, cellHeight: 90, gridGap: 10 });
    const noTuning = { ...makeBaseConfig(), tuning: undefined as unknown as TuningConfig };
    expect(normalizeConfig(noTuning).tuning).toEqual(defaultTuning());
  });

  it("migrates a survey whose rows or columns were repaired from the repaired size", () => {
    // 0 rows and 2.4 columns become 1 row and 2 columns.
    const out = normalizeConfig(savedBefore(0, 2.4));
    expect(out.tuning).toMatchObject({ cellWidth: 270, cellHeight: 550 });
    expect(gridPixelSize(out)).toEqual({ width: 550, height: 550 });
  });

  it("grows the grid by one cell and one gap for each column added", () => {
    let state = editorReducer(makeState(), { type: "newSurvey" });
    state = editorReducer(state, { type: "updateLayout", patch: { cols: 4 } });
    expect(gridPixelSize(state.config)).toEqual({ width: 390, height: 290 });
    state = editorReducer(state, { type: "updateTuning", patch: { cellWidth: 60 } });
    expect(gridPixelSize(state.config)).toEqual({ width: 270, height: 290 });

    // A migrated survey's cells keep their size as the grid grows.
    const old = editorReducer(makeState(normalizeConfig(savedBefore(3, 3))), {
      type: "updateLayout",
      patch: { cols: 4 },
    });
    expect(gridPixelSize(old.config).width).toBeCloseTo(550 + 530 / 3 + 10, 5);
    expect(gridPixelSize(old.config).height).toBe(550);
  });

  it("opens a survey saved with a fixed frame with no unsaved changes", () => {
    let state = editorReducer(makeState(), { type: "newSurvey" });
    // What My surveys does to open a saved survey.
    state = editorReducer(state, { type: "setConfig", config: savedBefore(3, 3) });
    state = editorReducer(state, { type: "markSaved", record: { id: "base-id", updated_at: SAVED_AT } });
    expect(hasUnsavedChanges(state)).toBe(false);
    expect(gridPixelSize(state.config)).toEqual({ width: 550, height: 550 });
    // Typing in the study name box runs normalizeConfig again; it changes nothing more.
    const again = editorReducer(state, { type: "setConfig", config: { ...state.config } });
    expect(hasUnsavedChanges(again)).toBe(false);
  });
});

// ─── Where a grid wider than the screen starts ────────────────────────────────

describe("where a grid wider than the screen starts", () => {
  it("leaves the choice out of surveys that never made it", () => {
    expect("scrollStart" in editorReducer(makeState(), { type: "newSurvey" }).config.layout).toBe(false);
    expect("scrollStart" in normalizeConfig(makeBaseConfig()).layout).toBe(false);
  });

  it("keeps the left edge when it was chosen", () => {
    const config = makeBaseConfig();
    config.layout.scrollStart = "left";
    expect(normalizeConfig(config).layout.scrollStart).toBe("left");
  });
});
