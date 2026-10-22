import { describe, it, expect } from "vitest";
import type { GridConfig } from "../grid-types";
import {
  buildQualtricsSnippet,
  getEmbeddedDataFields,
  sanitizeEmbeddedDataField,
} from "./qualtricsExport";
import { addFollowUpStep, getSteps, replaceStep } from "./steps";

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

// ─── Running the exported script ──────────────────────────────────────────────

function baseConfig(): GridConfig {
  return {
    id: "s1",
    name: "Neighbors",
    layout: {
      questionText: "Place your neighbors",
      rows: 2,
      cols: 2,
      includeCenterCell: false,
      centerCellLabel: "",
      centerRow: null,
      centerCol: null,
      backgroundImageUrl: "",
    },
    tuning: {
      gridGap: 4,
      gridPadding: 0,
      labelFontSizeRem: 1,
      cellWidth: 100,
      cellHeight: 100,
      previewWidth: 300,
      previewHeight: 300,
    },
    survey: {
      categoriesCsv: "A, B",
      allowInteraction: true,
      selectionMode: "paint",
      advancedCategories: false,
      categoryMeta: { A: { color: "#ff0000", imageUrl: "" }, B: { color: "#00ff00", imageUrl: "" } },
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

function twoStepConfig(): GridConfig {
  const config = addFollowUpStep(baseConfig());
  const second = getSteps(config)[1];
  return replaceStep(config, 1, {
    ...second,
    layout: { ...second.layout, questionText: "How do you feel about them?" },
    experimental: { ...second.experimental!, responseLabelsCsv: "Good, Bad" },
  });
}

/** Runs a snippet against a fake Qualtrics engine in jsdom. */
function runSnippet(snippet: string) {
  const embedded: Record<string, string> = {};
  let ready: ((this: unknown) => void) | null = null;
  let nextClicked = false;
  const Qualtrics = {
    SurveyEngine: {
      addOnload: () => {},
      addOnUnload: () => {},
      addOnReady: (fn: (this: unknown) => void) => {
        ready = fn;
      },
      setEmbeddedData: (key: string, value: string) => {
        embedded[key] = value;
      },
    },
  };
  new Function("Qualtrics", snippet)(Qualtrics);
  const container = document.createElement("div");
  document.body.appendChild(container);
  ready!.call({
    getQuestionTextContainer: () => container,
    clickNextButton: () => {
      nextClicked = true;
    },
  });
  const gridCells = () => {
    const grid = Array.from(container.querySelectorAll("div")).find(
      (el) => el.style.display === "grid",
    )!;
    return Array.from(grid.children) as HTMLElement[];
  };
  const clickNext = () =>
    (Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Next",
    ) as HTMLButtonElement).click();
  return { container, embedded, gridCells, clickNext, nextClicked: () => nextClicked };
}

describe("buildQualtricsSnippet", () => {
  it("keeps the original field name for a single-step survey", () => {
    const run = runSnippet(buildQualtricsSnippet(baseConfig()));
    run.gridCells()[0].click();
    run.clickNext();
    expect(JSON.parse(run.embedded.GridAssignments)).toEqual({ "r1-c1": "A" });
    expect(run.nextClicked()).toBe(true);
    expect(getEmbeddedDataFields(baseConfig()).map((f) => f.name)).toEqual(["GridAssignments"]);
  });

  it("carries step 1's answers into step 2 and saves each step separately", () => {
    const config = twoStepConfig();
    expect(getEmbeddedDataFields(config).map((f) => f.name)).toEqual([
      "GridStep1_Assignments",
      "GridStep2_Prefills",
      "GridStep2_Responses",
    ]);

    const run = runSnippet(buildQualtricsSnippet(config));
    expect(run.container.textContent).toContain("Step 1 of 2");

    // Step 1: paint "A" into the top-left cell, leave the rest empty.
    run.gridCells()[0].click();
    run.clickNext();
    expect(JSON.parse(run.embedded.GridStep1_Assignments)).toEqual({ "r1-c1": "A" });
    expect(run.nextClicked()).toBe(false);

    // Step 2: shows the respondent's own layout; only the filled cell can be rated.
    expect(run.container.textContent).toContain("Step 2 of 2");
    expect(run.container.textContent).toContain("How do you feel about them?");
    const cells = run.gridCells();
    expect(cells[0].textContent).toContain("A");
    const select = cells[0].querySelector("select")!;
    expect(select).not.toBeNull();
    expect(cells[1].querySelector("select")).toBeNull();
    expect(cells[3].querySelector("select")).toBeNull();

    select.value = "Good";
    select.dispatchEvent(new Event("change"));
    run.clickNext();

    expect(JSON.parse(run.embedded.GridStep2_Prefills)).toEqual({ "r1-c1": "A" });
    expect(JSON.parse(run.embedded.GridStep2_Responses)).toEqual({ "r1-c1": "Good" });
    expect(run.nextClicked()).toBe(true);
  });

  it("an independent second step does not inherit answers", () => {
    let config = twoStepConfig();
    const second = getSteps(config)[1];
    config = replaceStep(config, 1, {
      ...second,
      buildsOnPrevious: false,
      experimental: { ...second.experimental!, fixedAssignments: { "r2-c2": "B" } },
    });
    const run = runSnippet(buildQualtricsSnippet(config));
    run.gridCells()[0].click();
    run.clickNext();
    expect(JSON.parse(run.embedded.GridStep2_Prefills)).toEqual({ "r2-c2": "B" });
  });
});
