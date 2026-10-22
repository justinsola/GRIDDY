import { describe, it, expect } from "vitest";
import type { GridConfig } from "../grid-types";
import {
  addFollowUpStep,
  getStepCount,
  getSteps,
  removeStepAt,
  replaceStep,
  resolveSteps,
  setStepBuildsOnPrevious,
} from "./steps";

function makeConfig(): GridConfig {
  return {
    id: "survey-1",
    name: "Neighbors",
    layout: {
      questionText: "Lay out the neighborhood",
      rows: 2,
      cols: 3,
      includeCenterCell: true,
      centerCellLabel: "You",
      centerRow: 1,
      centerCol: 2,
      backgroundImageUrl: "https://example.com/map.png",
    },
    tuning: {
      gridGap: 8,
      gridPadding: 0,
      labelFontSizeRem: 1,
      cellWidth: 100,
      cellHeight: 100,
      previewWidth: 500,
      previewHeight: 400,
    },
    survey: {
      categoriesCsv: "A, B",
      allowInteraction: true,
      selectionMode: "paint",
      advancedCategories: false,
      categoryMeta: { A: { color: "#ff0000", imageUrl: "" }, B: { color: "#00ff00", imageUrl: "" } },
    },
  };
}

describe("steps", () => {
  it("treats a legacy config as a single step and does not add followUpSteps", () => {
    const config = makeConfig();
    expect(getStepCount(config)).toBe(1);
    const updated = replaceStep(config, 0, {
      ...getSteps(config)[0],
      layout: { ...config.layout, rows: 4 },
    });
    expect(updated.layout.rows).toBe(4);
    expect(updated.id).toBe("survey-1");
    expect("followUpSteps" in updated).toBe(false);
  });

  it("adds a follow-up step that builds on the previous one", () => {
    const config = addFollowUpStep(makeConfig());
    expect(getStepCount(config)).toBe(2);
    const [, second] = resolveSteps(config);
    expect(second.buildsOnPrevious).toBe(true);
    expect(second.experimental?.enabled).toBe(true);
    expect(second.id).not.toBe("survey-1");
  });

  it("inherits grid, sizing and categories but keeps its own question and labels", () => {
    let config = addFollowUpStep(makeConfig());
    const stored = getSteps(config)[1];
    config = replaceStep(config, 1, {
      ...stored,
      layout: { ...stored.layout, questionText: "React", rows: 9 },
      survey: { ...stored.survey, selectionMode: "dropdown", categoriesCsv: "Z" },
      experimental: { ...stored.experimental!, responseLabelsCsv: "Good, Bad", enabled: false },
    });
    // Change step 1 after step 2 was created: step 2 should follow it.
    config = replaceStep(config, 0, {
      ...getSteps(config)[0],
      layout: { ...config.layout, cols: 5 },
      survey: { ...config.survey, categoriesCsv: "A, B, C" },
    });

    const second = resolveSteps(config)[1];
    expect(second.layout.questionText).toBe("React");
    expect(second.layout.rows).toBe(2);
    expect(second.layout.cols).toBe(5);
    expect(second.layout.centerCellLabel).toBe("You");
    expect(second.tuning.previewWidth).toBe(500);
    expect(second.survey.categoriesCsv).toBe("A, B, C");
    expect(second.survey.selectionMode).toBe("dropdown");
    expect(second.experimental?.responseLabelsCsv).toBe("Good, Bad");
    expect(second.experimental?.enabled).toBe(true);
  });

  it("chains inheritance through several steps", () => {
    const config = addFollowUpStep(addFollowUpStep(makeConfig()));
    const third = resolveSteps(config)[2];
    expect(third.layout.cols).toBe(3);
    expect(third.survey.categoriesCsv).toBe("A, B");
  });

  it("ignores buildsOnPrevious on the first step", () => {
    const config = { ...makeConfig(), buildsOnPrevious: true };
    expect(resolveSteps(config)[0].buildsOnPrevious).toBe(false);
  });

  it("removing step 1 promotes step 2 with the grid it had inherited", () => {
    const config = removeStepAt(addFollowUpStep(makeConfig()), 0);
    expect(getStepCount(config)).toBe(1);
    expect(config.id).toBe("survey-1");
    expect(config.layout.cols).toBe(3);
    expect(config.experimental?.enabled).toBe(true);
    expect("followUpSteps" in config).toBe(false);
  });

  it("removing a middle step makes the next one build on the step before", () => {
    const config = removeStepAt(addFollowUpStep(addFollowUpStep(makeConfig())), 1);
    expect(getStepCount(config)).toBe(2);
    expect(resolveSteps(config)[1].buildsOnPrevious).toBe(true);
  });

  it("unlinking a step keeps the grid it had inherited", () => {
    const linked = addFollowUpStep(makeConfig());
    const unlinked = setStepBuildsOnPrevious(linked, 1, false);
    const second = resolveSteps(unlinked)[1];
    expect(second.buildsOnPrevious).toBe(false);
    expect(second.layout.cols).toBe(3);
    expect(second.survey.categoriesCsv).toBe("A, B");
  });

  it("will not remove the only step", () => {
    const config = makeConfig();
    expect(removeStepAt(config, 0)).toBe(config);
  });
});
