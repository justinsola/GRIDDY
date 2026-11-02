import { describe, expect, it } from "vitest";
import type { TuningConfig } from "../grid-types";
import {
  backgroundImageMaxDim,
  cellSizedTuning,
  defaultTuning,
  gridPixelSize,
  gridSizeText,
  parseCellSize,
  parseGridSize,
  repairGridSize,
} from "./gridSize";

describe("parseGridSize", () => {
  it("accepts whole numbers from 1 to 10", () => {
    expect(parseGridSize("1")).toBe(1);
    expect(parseGridSize("10")).toBe(10);
    expect(parseGridSize(" 4 ")).toBe(4);
  });

  it("rejects 0, negative numbers, decimals and sizes above 10", () => {
    for (const raw of ["0", "-1", "2.5", "2.0", "11", "1e1", "", "abc"]) {
      expect(parseGridSize(raw)).toBeNull();
    }
  });
});

describe("repairGridSize", () => {
  it("keeps whole sizes of 1 or more", () => {
    expect(repairGridSize(3, 3)).toBe(3);
    expect(repairGridSize(12, 3)).toBe(12);
  });

  it("repairs sizes older versions could save", () => {
    expect(repairGridSize(0, 3)).toBe(1);
    expect(repairGridSize(-2, 3)).toBe(1);
    expect(repairGridSize(2.4, 3)).toBe(2);
    expect(repairGridSize(Number.NaN, 3)).toBe(3);
    expect(repairGridSize(undefined, 3)).toBe(3);
  });
});

describe("parseCellSize", () => {
  it("accepts whole numbers of pixels from 20 to 600", () => {
    expect(parseCellSize("20")).toBe(20);
    expect(parseCellSize("600")).toBe(600);
    expect(parseCellSize(" 100 ")).toBe(100);
  });

  it("rejects anything else", () => {
    for (const raw of ["19", "601", "0", "-40", "120.5", "100.0", "1e2", "", "abc"]) {
      expect(parseCellSize(raw)).toBeNull();
    }
  });
});

/** Cells of `cellWidth` × `cellHeight` px, `gridGap` apart and `gridPadding`
 * from the border. */
const cells = (cellWidth: number, cellHeight: number, gridGap = 10, gridPadding = 0) => ({
  cellWidth,
  cellHeight,
  gridGap,
  gridPadding,
});

describe("gridPixelSize", () => {
  it("adds up the cells, the gaps between them and the padding around them", () => {
    expect(gridPixelSize({ layout: { rows: 3, cols: 3 }, tuning: cells(100, 100) })).toEqual({ width: 320, height: 320 });
    expect(gridPixelSize({ layout: { rows: 1, cols: 1 }, tuning: cells(100, 100) })).toEqual({ width: 100, height: 100 });
    // 5 × 60 + 4 gaps of 4 + 8 at each end; 2 × 80 + 1 gap + 8 at each end.
    expect(gridPixelSize({ layout: { rows: 2, cols: 5 }, tuning: cells(60, 80, 4, 8) })).toEqual({ width: 332, height: 180 });
  });

  it("gives a new survey's 3 × 3 grid 320 × 320 px", () => {
    expect(gridPixelSize({ layout: { rows: 3, cols: 3 }, tuning: defaultTuning() })).toEqual({ width: 320, height: 320 });
  });

  it("grows by one cell and one gap with every column or row", () => {
    const at = (rows: number, cols: number) => gridPixelSize({ layout: { rows, cols }, tuning: cells(120, 90) });
    expect(at(3, 4).width - at(3, 3).width).toBe(130);
    expect(at(4, 3).height - at(3, 3).height).toBe(100);
    expect(at(4, 3).width).toBe(at(3, 3).width);
  });

  it("drops floating-point dust", () => {
    // 7 cells of 115/7 px add up to 114.99999999999999 in floating point.
    expect(gridPixelSize({ layout: { rows: 1, cols: 7 }, tuning: cells(115 / 7, 50, 0) }).width).toBe(115);
  });

  it("counts numbers that are missing or unusable as a new survey's", () => {
    const tuning = { cellWidth: Number.NaN, cellHeight: -4, gridGap: undefined, gridPadding: -1 } as unknown as TuningConfig;
    expect(gridPixelSize({ layout: { rows: 3, cols: 3 }, tuning })).toEqual({ width: 320, height: 320 });
  });
});

describe("cellSizedTuning", () => {
  /** The tuning every survey was saved with before November 2026. */
  const oldTuning = (patch: Partial<TuningConfig> = {}): TuningConfig => ({
    gridGap: 10,
    gridPadding: 0,
    labelFontSizeRem: 1,
    cellWidth: 100,
    cellHeight: 120,
    previewWidth: 550,
    previewHeight: 550,
    ...patch,
  });

  it("gives an old survey the cell size its fixed frame gave it, unrounded", () => {
    const tuning = cellSizedTuning(oldTuning(), 3, 3);
    expect(tuning).toEqual({
      gridGap: 10,
      gridPadding: 0,
      labelFontSizeRem: 1,
      cellWidth: 530 / 3,
      cellHeight: 530 / 3,
      sizing: "cells",
    });
    expect(gridPixelSize({ layout: { rows: 3, cols: 3 }, tuning })).toEqual({ width: 550, height: 550 });
  });

  it("keeps the frame's exact size for every number of rows and columns", () => {
    for (let rows = 1; rows <= 10; rows++) {
      for (let cols = 1; cols <= 10; cols++) {
        const tuning = cellSizedTuning(oldTuning(), rows, cols);
        expect(gridPixelSize({ layout: { rows, cols }, tuning })).toEqual({ width: 550, height: 550 });
      }
    }
  });

  it("keeps the size of a frame with another gap and padding", () => {
    const tuning = cellSizedTuning(oldTuning({ gridGap: 4, gridPadding: 8, previewWidth: 360, previewHeight: 300 }), 3, 4);
    expect(tuning).toMatchObject({ gridGap: 4, gridPadding: 8, cellWidth: 83, cellHeight: 92 });
    expect(gridPixelSize({ layout: { rows: 3, cols: 4 }, tuning })).toEqual({ width: 360, height: 300 });
  });

  it("returns a survey already sized by its cells as it is", () => {
    const tuning = defaultTuning();
    expect(cellSizedTuning(tuning, 3, 3)).toBe(tuning);
    const migrated = cellSizedTuning(oldTuning(), 3, 3);
    expect(cellSizedTuning(migrated, 3, 3)).toBe(migrated);
  });

  it("falls back to a new survey's sizes for numbers that are missing or unusable", () => {
    for (const frame of [undefined, Number.NaN, Infinity, 0, -550, "550"]) {
      const tuning = cellSizedTuning(oldTuning({ previewWidth: frame as number, previewHeight: frame as number }), 3, 3);
      expect(tuning).toMatchObject({ cellWidth: 100, cellHeight: 100, sizing: "cells" });
    }
    // A frame too small for its gaps.
    expect(cellSizedTuning(oldTuning({ previewWidth: 15 }), 3, 3).cellWidth).toBe(100);
    expect(cellSizedTuning(oldTuning({ gridGap: Number.NaN, gridPadding: -2 }), 3, 3)).toMatchObject({
      gridGap: 10,
      gridPadding: 0,
      cellWidth: 530 / 3,
    });
    expect(cellSizedTuning({ ...defaultTuning(), cellWidth: 0, cellHeight: Number.NaN }, 3, 3)).toMatchObject({
      cellWidth: 100,
      cellHeight: 100,
    });
    expect(cellSizedTuning(undefined, 3, 3)).toEqual(defaultTuning());
  });
});

describe("gridSizeText", () => {
  it("says the size in whole pixels", () => {
    expect(gridSizeText({ width: 320, height: 320 })).toBe("320 × 320 px");
    expect(gridSizeText({ width: 736.666667, height: 550 })).toBe("737 × 550 px");
  });
});

describe("backgroundImageMaxDim", () => {
  it("keeps twice the grid's size, and never less than the 1100 px a background had before", () => {
    expect(backgroundImageMaxDim({ width: 320, height: 320 })).toBe(1100);
    expect(backgroundImageMaxDim({ width: 550, height: 550 })).toBe(1100);
    expect(backgroundImageMaxDim({ width: 1090, height: 430 })).toBe(2180);
    expect(backgroundImageMaxDim({ width: 400, height: 600.25 })).toBe(1201);
  });
});
