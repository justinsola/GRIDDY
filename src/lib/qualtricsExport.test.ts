import { parse } from "acorn";
import { describe, it, expect } from "vitest";
import { DEFAULT_RESPONDENT_TEXTS, respondentTextsFor, type RespondentTexts } from "./respondentTexts";
import {
  EXPORT_LICENSE_HEADER,
  JS_FIELD_PREFIX,
  sanitizeEmbeddedDataField,
  buildQualtricsSnippet,
  buildQualtricsQsf,
  buildQualtricsQsfForConfig,
  qsfEmbeddedFields,
  QualtricsQsfItem,
  recordedFieldName,
  singleGridFieldNames,
} from "./qualtricsExport";
import { GridConfig } from "../grid-types";
import { gridPixelSize } from "./gridSize";

function makeExperimentalConfig(
  selectionMode: "paint" | "dropdown" | "dragdrop",
): GridConfig {
  return makeConfig({
    survey: {
      categoriesCsv: "A, B",
      allowInteraction: true,
      selectionMode,
      advancedCategories: false,
      categoryMeta: {},
    },
    experimental: {
      enabled: true,
      prefillMode: "weighted",
      fixedAssignments: {},
      weightedEntries: [{ category: "A", weight: 1 }],
      responseLabelsCsv: "Safe, Unsafe",
      responseLabelMeta: {
        Safe: { color: "#22c55e", imageUrl: "" },
        Unsafe: { color: "#ef4444", imageUrl: "" },
      },
    },
  });
}

function makeConfig(overrides: Partial<GridConfig> = {}): GridConfig {
  return {
    id: "abc123",
    name: "Test Grid",
    layout: {
      questionText: "Place the labels",
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
      gridGap: 4,
      gridPadding: 8,
      labelFontSizeRem: 0.75,
      cellWidth: 60,
      cellHeight: 60,
      previewWidth: 360,
      previewHeight: 360,
    },
    survey: {
      categoriesCsv: "Dwarves, Elves",
      allowInteraction: true,
      selectionMode: "paint",
      advancedCategories: false,
      categoryMeta: {},
    },
    ...overrides,
  };
}

/** The embedded-data fields a .qsf declares in its Survey Flow. */
function declaredFields(qsf: string): string[] {
  const flow = JSON.parse(qsf).SurveyElements.find((e: { Element: string }) => e.Element === "FL");
  const ed = flow.Payload.Flow.find((f: { Type: string }) => f.Type === "EmbeddedData");
  return ed.EmbeddedData.map((d: { Field: string }) => d.Field);
}

/**
 * The fields Qualtrics' new survey-taking experience records when each
 * question of a .qsf is shown. Each script runs in jsdom against a stub of
 * that engine: setEmbeddedData only says it is deprecated, and
 * setJSEmbeddedData records the field as "__js_" and its name.
 */
function recordedOnDisplay(qsf: string): string[] {
  const w = window as unknown as Record<string, unknown>;
  delete w.griddyPageGrids;
  delete w.griddyFieldOwners;
  delete w.griddyHidNext;
  delete w.griddyNextOwner;
  const recorded: Record<string, string> = {};
  const questions = JSON.parse(qsf).SurveyElements.filter((e: { Element: string }) => e.Element === "SQ");
  for (const q of questions) {
    const readyCbs: Array<() => void> = [];
    (globalThis as unknown as { Qualtrics: unknown }).Qualtrics = {
      SurveyEngine: {
        addOnload: () => {},
        addOnReady: (cb: () => void) => readyCbs.push(cb),
        addOnUnload: () => {},
        setEmbeddedData: () => "setEmbeddedData deprecated, please use setJSEmbeddedData",
        setJSEmbeddedData: (key: string, value: string) => {
          recorded[`__js_${key}`] = value;
        },
      },
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    new Function(q.Payload.QuestionJS)();
    const question = {
      questionId: q.Payload.QuestionID,
      getQuestionTextContainer: () => container,
      clickNextButton: () => {},
    };
    readyCbs.forEach((cb) => cb.call(question));
    container.remove();
  }
  return Object.keys(recorded);
}

describe("sanitizeEmbeddedDataField", () => {
  it("passes through a clean alphanumeric name unchanged", () => {
    expect(sanitizeEmbeddedDataField("GridAssignments", "field")).toBe(
      "GridAssignments",
    );
  });

  it("replaces spaces with underscores", () => {
    expect(sanitizeEmbeddedDataField("My Field Name", "field")).toBe(
      "My_Field_Name",
    );
  });

  it("collapses multiple consecutive special chars into one underscore", () => {
    expect(sanitizeEmbeddedDataField("hello!!world", "field")).toBe(
      "hello_world",
    );
  });

  it("strips leading and trailing underscores", () => {
    expect(sanitizeEmbeddedDataField("__hello__", "field")).toBe("hello");
  });

  it("prepends fallback when name starts with a digit", () => {
    expect(sanitizeEmbeddedDataField("1Field", "grid")).toBe("grid_1Field");
  });

  it("returns fallback with trailing underscore when name is empty", () => {
    // cleaned="" fails the letter/underscore prefix check, so fallback+"_"+cleaned="fallback_"
    expect(sanitizeEmbeddedDataField("", "fallback")).toBe("fallback_");
  });

  it("returns fallback with trailing underscore when name is only special characters", () => {
    // special chars collapse to "" after stripping → same path as empty name
    expect(sanitizeEmbeddedDataField("!!!@@@", "fallback")).toBe("fallback_");
  });

  it("truncates to 64 characters", () => {
    const long = "A".repeat(80);
    const result = sanitizeEmbeddedDataField(long, "field");
    expect(result.length).toBe(64);
    expect(result).toBe("A".repeat(64));
  });

  it("handles underscores in name without modification", () => {
    expect(sanitizeEmbeddedDataField("Grid_Assignments_2024", "field")).toBe(
      "Grid_Assignments_2024",
    );
  });

  it("handles name starting with underscore by prepending fallback", () => {
    // Leading underscores get stripped, leaving a valid identifier
    expect(sanitizeEmbeddedDataField("_ValidName", "field")).toBe("ValidName");
  });
});

describe("qsfEmbeddedFields", () => {
  it("returns the standard assignment field for non-experimental configs", () => {
    expect(qsfEmbeddedFields({ title: "t", config: makeConfig() })).toEqual([
      "GridAssignments",
    ]);
  });

  it("returns prefill and response fields for experimental configs", () => {
    const config = makeConfig({
      experimental: {
        enabled: true,
        prefillMode: "fixed",
        fixedAssignments: {},
        weightedEntries: [],
        responseLabelsCsv: "Good, Bad",
        responseLabelMeta: {},
      },
    });
    expect(qsfEmbeddedFields({ title: "t", config })).toEqual([
      "GridPrefills",
      "GridResponses",
    ]);
  });

  it("honors custom field names", () => {
    const item: QualtricsQsfItem = {
      title: "t",
      config: makeConfig(),
      embeddedDataField: "Custom_Field",
    };
    expect(qsfEmbeddedFields(item)).toEqual(["Custom_Field"]);
  });
});

describe("buildQualtricsQsf", () => {
  it("produces a valid QSF JSON document with SurveyEntry and SurveyElements", () => {
    const qsf = JSON.parse(buildQualtricsQsfForConfig(makeConfig()));
    expect(qsf.SurveyEntry).toBeDefined();
    expect(qsf.SurveyEntry.SurveyName).toBe("Test Grid");
    expect(Array.isArray(qsf.SurveyElements)).toBe(true);

    const elementTypes = qsf.SurveyElements.map((e: { Element: string }) => e.Element);
    // Element set mirrors a real Qualtrics export so the importer accepts it.
    for (const required of [
      "BL",
      "FL",
      "PL",
      "PROJ",
      "QC",
      "QG",
      "QGO",
      "RS",
      "SCO",
      "SO",
      "SQ",
      "STAT",
    ]) {
      expect(elementTypes).toContain(required);
    }

    // BL Payload must be a JSON array of blocks (object form fails import).
    const blockEl = qsf.SurveyElements.find(
      (e: { Element: string }) => e.Element === "BL",
    );
    expect(Array.isArray(blockEl.Payload)).toBe(true);
  });

  it("sets a non-empty SurveyBrandID (importer requires length >= 1)", () => {
    const qsf = JSON.parse(buildQualtricsQsfForConfig(makeConfig()));
    expect(qsf.SurveyEntry.SurveyBrandID.length).toBeGreaterThanOrEqual(1);
  });

  it("attaches the rendering JavaScript to each question as a DB/TB question", () => {
    const qsf = JSON.parse(buildQualtricsQsfForConfig(makeConfig()));
    const questions = qsf.SurveyElements.filter(
      (e: { Element: string }) => e.Element === "SQ",
    );
    expect(questions).toHaveLength(1);
    const q = questions[0];
    expect(q.Payload.QuestionType).toBe("DB");
    expect(q.Payload.Selector).toBe("TB");
    expect(q.Payload.QuestionJS).toContain("Qualtrics.SurveyEngine.addOnReady");
  });

  it("declares all embedded data fields in the Survey Flow", () => {
    const qsf = JSON.parse(buildQualtricsQsfForConfig(makeConfig()));
    const flow = qsf.SurveyElements.find(
      (e: { Element: string }) => e.Element === "FL",
    );
    const edElement = flow.Payload.Flow.find(
      (f: { Type: string }) => f.Type === "EmbeddedData",
    );
    const fields = edElement.EmbeddedData.map((d: { Field: string }) => d.Field);
    expect(fields).toEqual(["__js_GridAssignments"]);
  });

  it("creates one block and question per item for bundles, with unique fields", () => {
    const items: QualtricsQsfItem[] = [
      { title: "A", config: makeConfig(), embeddedDataField: "GridAssignments_A" },
      { title: "B", config: makeConfig(), embeddedDataField: "GridAssignments_B" },
    ];
    const qsf = JSON.parse(buildQualtricsQsf(items, "Bundle"));

    const questions = qsf.SurveyElements.filter(
      (e: { Element: string }) => e.Element === "SQ",
    );
    expect(questions).toHaveLength(2);

    const blockEl = qsf.SurveyElements.find(
      (e: { Element: string }) => e.Element === "BL",
    );
    expect(Array.isArray(blockEl.Payload)).toBe(true);
    expect(blockEl.Payload).toHaveLength(2);

    const flow = qsf.SurveyElements.find(
      (e: { Element: string }) => e.Element === "FL",
    );
    const blockFlows = flow.Payload.Flow.filter(
      (f: { Type: string }) => f.Type === "Block",
    );
    expect(blockFlows).toHaveLength(2);

    const edElement = flow.Payload.Flow.find(
      (f: { Type: string }) => f.Type === "EmbeddedData",
    );
    const fields = edElement.EmbeddedData.map((d: { Field: string }) => d.Field);
    expect(fields).toEqual(["__js_GridAssignments_A", "__js_GridAssignments_B"]);
  });

  it("uses parameterized prefill/response fields in experimental snippets", () => {
    const config = makeConfig({
      experimental: {
        enabled: true,
        prefillMode: "fixed",
        fixedAssignments: { "r1-c1": "Dwarves" },
        weightedEntries: [],
        responseLabelsCsv: "Good, Bad",
        responseLabelMeta: {},
      },
    });
    const item: QualtricsQsfItem = {
      title: "Exp",
      config,
      prefillsField: "MyPrefills",
      responsesField: "MyResponses",
    };
    const qsf = JSON.parse(buildQualtricsQsf([item], "Exp"));
    const q = qsf.SurveyElements.find(
      (e: { Element: string }) => e.Element === "SQ",
    );
    expect(q.Payload.QuestionJS).toContain('saveField("MyPrefills"');
    expect(q.Payload.QuestionJS).toContain('saveField("MyResponses"');
    expect(declaredFields(buildQualtricsQsf([item], "Exp"))).toEqual(["__js_MyPrefills", "__js_MyResponses"]);
  });
});

describe("fields for Qualtrics' new survey-taking experience", () => {
  it("names a field's recorded column with the __js_ prefix", () => {
    expect(JS_FIELD_PREFIX).toBe("__js_");
    expect(recordedFieldName("GridAssignments_Q2")).toBe("__js_GridAssignments_Q2");
  });

  it("declares the __js_ name of the field a plain grid records", () => {
    const qsf = buildQualtricsQsfForConfig(makeConfig());
    expect(declaredFields(qsf)).toEqual(["__js_GridAssignments"]);
    expect(recordedOnDisplay(qsf)).toEqual(["__js_GridAssignments"]);
  });

  it("declares the __js_ names of both fields an experiment records", () => {
    const qsf = buildQualtricsQsfForConfig(makeExperimentalConfig("paint"));
    expect(declaredFields(qsf)).toEqual(["__js_GridPrefills", "__js_GridResponses"]);
    expect(recordedOnDisplay(qsf).sort()).toEqual(["__js_GridPrefills", "__js_GridResponses"]);
  });

  it("declares the __js_ names on the multi-question .qsf", () => {
    const qsf = buildQualtricsQsf(
      [
        { title: "Map", config: makeConfig(), embeddedDataField: "GridAssignments_Map" },
        {
          title: "Reactions",
          config: makeExperimentalConfig("dragdrop"),
          prefillsField: "GridPrefills_Reactions",
          responsesField: "GridResponses_Reactions",
        },
      ],
      "Bundle",
    );
    expect(declaredFields(qsf)).toEqual([
      "__js_GridAssignments_Map",
      "__js_GridPrefills_Reactions",
      "__js_GridResponses_Reactions",
    ]);
    expect(recordedOnDisplay(qsf).sort()).toEqual([...declaredFields(qsf)].sort());
  });
});

describe("question text made only of whitespace", () => {
  const withQuestion = (questionText: string): GridConfig =>
    makeConfig({ layout: { ...makeConfig().layout, questionText } });
  const question = (qsf: string) =>
    JSON.parse(qsf).SurveyElements.find((e: { Element: string }) => e.Element === "SQ");

  it("counts as blank in the .qsf and in the script", () => {
    for (const blank of ["   ", "\u00a0", "\n\n", " \u00a0\r\n\t "]) {
      const q = question(buildQualtricsQsf([{ title: "Study A", config: withQuestion(blank) }]));
      expect(q.Payload.QuestionText).toBe("");
      expect(q.Payload.QuestionDescription).toBe("Study A");
      expect(q.SecondaryAttribute).toBe("Study A");
      expect(q.Payload.QuestionJS).toContain('"questionText": ""');
      expect(buildQualtricsSnippet(withQuestion(blank))).toContain('"questionText": ""');
    }
  });

  it("keeps question text with visible characters exactly as written", () => {
    const text = "  Who lives where?\n ";
    const q = question(buildQualtricsQsf([{ title: "Study A", config: withQuestion(text) }]));
    expect(q.Payload.QuestionText).toBe(text);
    expect(q.Payload.QuestionDescription).toBe(text);
    expect(buildQualtricsSnippet(withQuestion(text))).toContain(`"questionText": ${JSON.stringify(text)}`);
  });
});

describe("buildQualtricsSnippet experimental respondent input methods", () => {
  // The generated JS contains every branch; selectionMode is embedded config
  // that decides which one runs at runtime. So we assert (a) valid JS, (b) all
  // three reaction input methods are implemented (the bug was that only the
  // dropdown existed), and (c) the chosen mode is carried in the config.

  it("emits syntactically valid JavaScript for every input method", () => {
    for (const mode of ["paint", "dropdown", "dragdrop"] as const) {
      const js = buildQualtricsSnippet(makeExperimentalConfig(mode));
      expect(() => new Function(js)).not.toThrow();
    }
  });

  it("implements paint, drag-drop, and dropdown reaction placement", () => {
    const js = buildQualtricsSnippet(makeExperimentalConfig("paint"));
    // paint: click-to-place reaction toolbar, labelled from the grid's texts
    expect(js).toContain("respToolbarLabel.textContent = texts.reacting");
    expect(js).toContain('"reacting": "Reacting:"');
    expect(js).toContain("experimentalResponses[cellKey] = activeResponseLabel");
    // drag-drop: draggable reaction tray + clear chip, labelled from the texts
    expect(js).toContain("respDragLabel.textContent = texts.dragReaction");
    expect(js).toContain(
      '"dragReaction": "Drag a reaction onto a cell, or select a reaction and then a cell:"',
    );
    expect(js).toContain("createResponseChip(texts.clearReactionChip, true)");
    expect(js).toContain("__CLEAR_RESP__");
    // dropdown: per-cell select still available, its empty choice from the texts
    expect(js).toContain("emptyOpt.textContent = texts.chooseReaction");
    expect(js).toContain('"chooseReaction": "— react —"');
    // each path is gated on the runtime selectionMode
    expect(js).toContain(
      'isExperimental && responseLabels.length > 0 && selectionMode === "paint"',
    );
    expect(js).toContain(
      'isExperimental && responseLabels.length > 0 && selectionMode === "dragdrop"',
    );
  });

  it("carries the selected input method in the embedded config", () => {
    for (const mode of ["paint", "dropdown", "dragdrop"] as const) {
      const js = buildQualtricsSnippet(makeExperimentalConfig(mode));
      expect(js).toContain(`"selectionMode": "${mode}"`);
    }
  });
});

// ─── Blocked cells (barriers) render + connect in the browser DOM ────────────

/**
 * Execute a generated snippet inside jsdom with a stubbed Qualtrics engine,
 * returning the rendered question container so tests can inspect the DOM.
 */
function runSnippet(config: GridConfig): HTMLElement {
  return runScript(buildQualtricsSnippet(config));
}

/** Run an exported script, such as a .qsf question's, as runSnippet does. */
function runScript(snippet: string): HTMLElement {
  const readyCbs: Array<() => void> = [];
  (globalThis as unknown as { Qualtrics: unknown }).Qualtrics = {
    SurveyEngine: {
      addOnload: () => {},
      addOnReady: (cb: () => void) => readyCbs.push(cb),
      addOnUnload: () => {},
      setEmbeddedData: () => {},
    },
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const question = {
    getQuestionTextContainer: () => container,
    clickNextButton: () => {},
  };
  // The snippet is top-level code that registers callbacks on Qualtrics.
  new Function(snippet)();
  readyCbs.forEach((cb) => cb.call(question));
  return container;
}

function gridCells(container: HTMLElement): HTMLElement[] {
  const grid = Array.from(container.querySelectorAll("div")).find(
    (d) => d.style.display === "grid",
  );
  if (!grid) throw new Error("grid not found");
  return Array.from(grid.children) as HTMLElement[];
}

describe("blocked cells in the exported grid", () => {
  // 3×3 grid, top-left L of "Wall": r1-c1, r1-c2, r2-c1
  const config = makeConfig({
    layout: {
      questionText: "Q",
      rows: 3,
      cols: 3,
      includeCenterCell: false,
      centerCellLabel: "",
      centerRow: null,
      centerCol: null,
      backgroundImageUrl: "",
      barriersCsv: "Wall",
      barrierMeta: { Wall: { color: "#334155", imageUrl: "" } },
      blockedCells: { "r1-c1": "Wall", "r1-c2": "Wall", "r2-c1": "Wall" },
    },
  });

  const TEAL = "rgb(51, 65, 85)"; // rgb form of #334155

  // A blocked cell's gap-bridging fillers are its absolutely-positioned child
  // divs painted with the barrier color.
  function fillers(cell: HTMLElement): HTMLElement[] {
    return (Array.from(cell.children) as HTMLElement[]).filter(
      (c) =>
        c.tagName === "DIV" &&
        c.style.position === "absolute" &&
        c.style.backgroundColor === TEAL,
    );
  }

  it("renders (without error) and fills every blocked cell with the barrier color", () => {
    const cells = gridCells(runSnippet(config));
    for (const idx of [0, 1, 3]) {
      expect(cells[idx].style.backgroundColor).toBe(TEAL);
    }
  });

  it("leaves normal cells unblocked (not filled with the barrier color)", () => {
    const cells = gridCells(runSnippet(config));
    // r3-c3 (index 8) is a normal paint cell.
    expect(cells[8].style.backgroundColor).not.toBe(TEAL);
  });

  it("bridges every shared edge with a background-colored filler", () => {
    const cells = gridCells(runSnippet(config));
    // The top-left cell shares its right edge (r1-c2) and bottom edge (r2-c1).
    const parts = fillers(cells[0]);
    // Fillers extend into the gaps via fixed-pixel offsets (no percentages).
    expect(parts.some((p) => p.style.right === "-4px")).toBe(true); // right edge
    expect(parts.some((p) => p.style.bottom === "-4px")).toBe(true); // down edge
  });

  it("does NOT bridge a cell that only touches diagonally", () => {
    // r1-c1 (Wall) and r2-c2 (Wall) share only a corner — no edge.
    const diag = makeConfig({
      layout: {
        ...config.layout,
        blockedCells: { "r1-c1": "Wall", "r2-c2": "Wall" },
      },
    });
    const cells = gridCells(runSnippet(diag));
    expect(fillers(cells[0]).length).toBe(0); // r1-c1
    expect(fillers(cells[4]).length).toBe(0); // r2-c2
  });

  it("does NOT fill the concave corner of an L-shape (no floating notch)", () => {
    // r1-c1, r1-c2, r2-c1 form an L; the diagonal r2-c2 is NOT blocked, so the
    // corner between them should stay open instead of poking a square toward it.
    const cells = gridCells(runSnippet(config));
    const parts = fillers(cells[0]); // r1-c1
    expect(parts.length).toBe(2); // just the right + down edge bridges
    // Neither edge bridge is a square corner filler (offset on both axes).
    expect(
      parts.some((p) => p.style.right === "-4px" && p.style.bottom === "-4px"),
    ).toBe(false);
  });

  it("fills the inner corner of a true solid 2x2 block", () => {
    // r1-c1, r1-c2, r2-c1, r2-c2 are all Wall — a solid block, so the shared
    // center intersection must be filled or the grid gap punches a hole in it.
    const solid = makeConfig({
      layout: {
        ...config.layout,
        blockedCells: {
          "r1-c1": "Wall",
          "r1-c2": "Wall",
          "r2-c1": "Wall",
          "r2-c2": "Wall",
        },
      },
    });
    const cells = gridCells(runSnippet(solid));
    const parts = fillers(cells[0]); // r1-c1
    // right edge + down edge + the now-legitimate inner corner fill.
    expect(parts.length).toBe(3);
    expect(
      parts.some((p) => p.style.right === "-4px" && p.style.bottom === "-4px"),
    ).toBe(true);
  });

  it("skips interaction handlers for blocked cells", () => {
    const js = buildQualtricsSnippet(config);
    expect(js).toContain("var isBlocked = !isCenter && !!blockedCells[key];");
    expect(js).toContain('selectionMode === "paint" && !isBlocked');
    expect(js).toContain('selectionMode === "dragdrop" && !isBlocked');
  });
});

// ─── The grid's size and where a wide grid starts ─────────────────────────────

describe("the grid's size in the export", () => {
  // 60 × 50 px cells, 4 px apart and 8 px from the border.
  const sizedByCells = (layout: Partial<GridConfig["layout"]> = {}): GridConfig => {
    const base = makeConfig();
    return {
      ...base,
      layout: { ...base.layout, ...layout },
      tuning: { gridGap: 4, gridPadding: 8, labelFontSizeRem: 0.75, cellWidth: 60, cellHeight: 50, sizing: "cells" },
    };
  };
  const frameOf = (container: HTMLElement) =>
    container.querySelector<HTMLElement>("[data-griddy-scroller]")!.firstElementChild as HTMLElement;

  it("sizes the grid's frame with the size the editor works out from its cells", () => {
    for (const [rows, cols] of [[3, 3], [2, 7], [10, 1]]) {
      const config = sizedByCells({ rows, cols });
      const size = gridPixelSize(config);
      const frame = frameOf(runSnippet(config));
      expect(frame.style.width).toBe(`${size.width}px`);
      expect(frame.style.height).toBe(`${size.height}px`);
    }
    expect(gridPixelSize(sizedByCells())).toEqual({ width: 204, height: 174 });
    // The .qsf carries the same script.
    const question = JSON.parse(buildQualtricsQsfForConfig(sizedByCells()))
      .SurveyElements.find((e: { Element: string }) => e.Element === "SQ");
    expect(question.Payload.QuestionJS).toContain('"gridWidth": 204');
    expect(question.Payload.QuestionJS).toContain('"gridHeight": 174');
  });

  it("keeps a survey saved before cell sizes at the size it had", () => {
    // makeConfig's grid filled a fixed frame of 360 × 360 px.
    const frame = frameOf(runSnippet(makeConfig()));
    expect(frame.style.width).toBe("360px");
    expect(frame.style.height).toBe("360px");
    const js = buildQualtricsSnippet(makeConfig());
    expect(js).toContain('"cellWidth": 112');
    expect(js).not.toContain('"previewWidth"');
  });

  it("carries where a grid wider than the screen starts", () => {
    expect(buildQualtricsSnippet(sizedByCells())).not.toContain('"scrollStart"');
    expect(buildQualtricsSnippet(sizedByCells({ scrollStart: "left" }))).toContain('"scrollStart": "left"');
    expect(() => parse(buildQualtricsSnippet(sizedByCells()), { ecmaVersion: 2017 })).not.toThrow();
  });
});

// ─── License header on exported code ─────────────────────────────────────────────

describe("license header", () => {
  const config = makeConfig();

  it("starts the exported script with the MIT notice", () => {
    const js = buildQualtricsSnippet(config);
    expect(js.startsWith(EXPORT_LICENSE_HEADER)).toBe(true);
    expect(js).toContain("MIT License");
    expect(js).toContain("Copyright (c) 2026 Justin Lucas Sola");
    expect(js).toContain("https://github.com/justinsola/GRIDDY");
  });

  it("keeps the header a single comment that does not break the script", () => {
    // Exactly one open and one close, so the header cannot swallow code.
    expect(EXPORT_LICENSE_HEADER.split("/*").length).toBe(2);
    expect(EXPORT_LICENSE_HEADER.split("*/").length).toBe(2);
    expect(EXPORT_LICENSE_HEADER.trimEnd().endsWith("*/")).toBe(true);
    // The snippet still parses and runs with the header in place.
    expect(() => new Function(buildQualtricsSnippet(config))).not.toThrow();
  });

  it("carries the header into the .qsf question JavaScript", () => {
    const qsf = JSON.parse(buildQualtricsQsfForConfig(config));
    const question = qsf.SurveyElements.find(
      (el: { Element: string }) => el.Element === "SQ",
    );
    expect(question.Payload.QuestionJS.startsWith(EXPORT_LICENSE_HEADER)).toBe(true);
  });
});

describe("field name ending for a grid exported on its own", () => {
  const withEnding = (fieldSuffix: string, base = makeConfig()): GridConfig => ({
    ...base,
    survey: { ...base.survey, fieldSuffix },
  });

  it("keeps the plain names when no ending is set", () => {
    expect(singleGridFieldNames(makeConfig())).toEqual({
      embeddedDataField: "GridAssignments",
      prefillsField: "GridPrefills",
      responsesField: "GridResponses",
    });
    expect(singleGridFieldNames(withEnding(" - ")).embeddedDataField).toBe("GridAssignments");
  });

  it("adds the ending to every field, cleaned up for Qualtrics", () => {
    expect(singleGridFieldNames(withEnding("Q2 after"))).toEqual({
      embeddedDataField: "GridAssignments_Q2_after",
      prefillsField: "GridPrefills_Q2_after",
      responsesField: "GridResponses_Q2_after",
    });
  });

  it("declares in the .qsf the __js_ names of the fields the script saves", () => {
    const qsf = buildQualtricsQsfForConfig(withEnding("Q2"));
    expect(declaredFields(qsf)).toEqual(["__js_GridAssignments_Q2"]);
    const question = JSON.parse(qsf).SurveyElements.find((e: { Element: string }) => e.Element === "SQ");
    expect(question.Payload.QuestionJS).toContain('saveField("GridAssignments_Q2"');
    expect(recordedOnDisplay(qsf)).toEqual(["__js_GridAssignments_Q2"]);
    const experiment = buildQualtricsQsfForConfig(withEnding("Q2", makeExperimentalConfig("paint")));
    expect(declaredFields(experiment)).toEqual(["__js_GridPrefills_Q2", "__js_GridResponses_Q2"]);
    expect(recordedOnDisplay(experiment).sort()).toEqual(["__js_GridPrefills_Q2", "__js_GridResponses_Q2"]);
  });
});

describe("words shown to respondents, in the export", () => {
  const withTexts = (respondentTexts: RespondentTexts, base = makeConfig()): GridConfig => ({
    ...base,
    survey: { ...base.survey, respondentTexts },
  });
  const questionScripts = (qsf: string): string[] =>
    JSON.parse(qsf)
      .SurveyElements.filter((e: { Element: string }) => e.Element === "SQ")
      .map((q: { Payload: { QuestionJS: string } }) => q.Payload.QuestionJS);
  /** The texts of a script's buttons and labels, as respondents see them. */
  const shownWords = (js: string): string[] => {
    const container = runScript(js);
    const words = Array.from(container.querySelectorAll("button, span")).map((el) => el.textContent ?? "");
    container.remove();
    return words;
  };
  // Parses as the ES2017 the script must stay within, like old browsers.
  const parseES2017 = (js: string) => () => parse(js, { ecmaVersion: 2017 });

  // Text that could break the script it is written into: quotes, a
  // backslash, the end of a script element, line breaks, piped text that
  // Qualtrics fills in, and the line separator ES2017 strings cannot hold.
  const BACKSLASH = String.fromCharCode(92);
  const LINE_SEPARATOR = String.fromCharCode(0x2028);
  const tricky = [
    `Say "next" or 'next'`,
    `a ${BACKSLASH} backslash, ${BACKSLASH}n and ${BACKSLASH}x41`,
    "</script><script>alert(1)</script>",
    "piped ${e://Field/Name} text",
    `a line${LINE_SEPARATOR}separator`,
  ].join("\n");

  it("ships GRIDDY's English when the grid has no wording of its own", () => {
    expect(respondentTextsFor(undefined)).toEqual(DEFAULT_RESPONDENT_TEXTS);
    const js = buildQualtricsSnippet(makeConfig());
    expect(js).toContain('"next": "Next"');
    expect(js).toContain('"placing": "Placing:"');
    // Nothing in the script looks like piped text to Qualtrics.
    expect(js).not.toContain("${");
    expect(parseES2017(js)).not.toThrow();
  });

  it("ships the grid's own wording once, merged with the English for the rest", () => {
    const js = buildQualtricsSnippet(withTexts({ next: "Siguiente", showMe: " " }));
    expect(js).toContain('"next": "Siguiente"');
    expect(js).toContain('"showMe": "Show me"');
    expect(js.split("Siguiente")).toHaveLength(2);
    expect(js).not.toContain('"respondentTexts"');
  });

  it("keeps quotes, backslashes, </script>, line breaks and ${ exactly as written", () => {
    const config = withTexts({ next: tricky, placing: tricky });
    const [questionJs] = questionScripts(buildQualtricsQsfForConfig(config));
    for (const js of [buildQualtricsSnippet(config), questionJs]) {
      expect(parseES2017(js)).not.toThrow();
      expect(js).not.toContain("</script");
      expect(js).not.toContain("${");
      expect(js).not.toContain(LINE_SEPARATOR);
      const words = shownWords(js);
      // The Next button and the "Placing:" label.
      expect(words.filter((w) => w === tricky)).toHaveLength(2);
    }
  });

  it("gives each grid of a multi-question .qsf its own wording", () => {
    const qsf = buildQualtricsQsf(
      [
        {
          title: "Español",
          config: withTexts({ next: "Siguiente", placing: "Colocando:" }),
          embeddedDataField: "GridAssignments_ES",
        },
        { title: "English", config: makeConfig(), embeddedDataField: "GridAssignments_EN" },
      ],
      "Bundle",
    );
    const [spanish, english] = questionScripts(qsf).map(shownWords);
    expect(spanish).toEqual(expect.arrayContaining(["Siguiente", "Colocando:"]));
    expect(spanish).not.toContain("Next");
    expect(english).toEqual(expect.arrayContaining(["Next", "Placing:"]));
    expect(english).not.toContain("Siguiente");
  });
});
