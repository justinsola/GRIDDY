import type { LayoutConfig, TuningConfig } from "../grid-types";

/** Rows and Columns each take a whole number from 1 to 10. */
export const MIN_GRID_SIZE = 1;
export const MAX_GRID_SIZE = 10;
export const GRID_SIZE_MESSAGE = "Use a whole number from 1 to 10";

/** The size typed in the Rows or Columns box, or null when it is not a whole
 * number from 1 to 10 (0, a negative number or a decimal would make the
 * export and the design preview disagree on the cells). */
export function parseGridSize(raw: string): number | null {
  const text = raw.trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const n = Number(text);
  return n >= MIN_GRID_SIZE && n <= MAX_GRID_SIZE ? n : null;
}

/** A saved size made usable: older versions could save 0, a negative number
 * or a decimal. Whole sizes of 1 or more are kept as they are. */
export function repairGridSize(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (Number.isInteger(n) && n >= MIN_GRID_SIZE) return n;
  return Math.max(MIN_GRID_SIZE, Math.round(n));
}

/** A cell's width and height each take a whole number of pixels from 20 to
 * 600; a new survey's cells are 90 × 90 px, so its 3 × 3 grid, 290 px wide
 * and 292 px with its border, fits Qualtrics' phone view exactly. */
export const MIN_CELL_SIZE = 20;
export const MAX_CELL_SIZE = 600;
export const DEFAULT_CELL_SIZE = 90;
export const CELL_SIZE_MESSAGE = "Use a whole number from 20 to 600";

/** The grid's 1 px border, on both sides. The exported grid draws it outside
 * its designed size, so whatever asks whether the grid fits a space measures
 * the grid's width plus this. */
export const GRID_BORDERS = 2;

/** The width, in pixels, Qualtrics' phone view leaves for a question's grid,
 * measured on 2 November 2026: its phone preview is 339 px wide, and leaves
 * 292 px in the new survey-taking experience (the default for new surveys)
 * and 309 px in the older layouts. The editor's note and the Respondent
 * preview's Phone view use the narrower one. */
export const PHONE_WIDTH = 292;
/** Cells narrower or shorter than this, in pixels, are hard to tap. */
export const MIN_TAP_SIZE = 44;

const DEFAULT_GRID_GAP = 10;
const DEFAULT_GRID_PADDING = 0;
/** The background image resolution every grid had before cell sizes. */
const MIN_BACKGROUND_IMAGE_DIM = 1100;
/** The most pixels an uploaded background image keeps on its longest side.
 * Twice the largest grid (6090 px) would be over 12,000 px: more than some
 * browsers can draw on a canvas, and too large to keep inside a survey. */
export const MAX_BACKGROUND_IMAGE_DIM = 4096;

/** The cell width or height typed in the editor, or null when it is not a
 * whole number from 20 to 600. */
export function parseCellSize(raw: string): number | null {
  const text = raw.trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const n = Number(text);
  return n >= MIN_CELL_SIZE && n <= MAX_CELL_SIZE ? n : null;
}

/** Digits for a number below 20: too small for a cell, but how a size still
 * being typed starts (150 is 1, then 15, then 150), so the editor shows no
 * note for them. */
export function isUnfinishedCellSize(raw: string): boolean {
  const text = raw.trim();
  return /^[0-9]+$/.test(text) && Number(text) < MIN_CELL_SIZE;
}

/** The tuning of a new survey: 90 × 90 px cells, 10 px apart. */
export function defaultTuning(): TuningConfig {
  return {
    gridGap: DEFAULT_GRID_GAP,
    gridPadding: DEFAULT_GRID_PADDING,
    labelFontSizeRem: 1,
    cellWidth: DEFAULT_CELL_SIZE,
    cellHeight: DEFAULT_CELL_SIZE,
    sizing: "cells",
  };
}

const isSize = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const isSpacing = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Surveys saved before November 2026 have no `sizing`: every grid was drawn
 * in a fixed frame of previewWidth × previewHeight px (550 × 550) and its
 * cells shared it out. They get the cell size they had, unrounded, so their
 * grid keeps exactly its pixel size; the frame's size is dropped. A number
 * that is missing or unusable gets a new survey's. A survey already sized by
 * its cells keeps its sizes. Cheap and idempotent: `tuning` itself comes back
 * when nothing needs to change. */
export function cellSizedTuning(
  tuning: TuningConfig | undefined,
  rows: number,
  cols: number,
): TuningConfig {
  if (!tuning || typeof tuning !== "object") return defaultTuning();
  const gridGap = isSpacing(tuning.gridGap) ? tuning.gridGap : DEFAULT_GRID_GAP;
  const gridPadding = isSpacing(tuning.gridPadding) ? tuning.gridPadding : DEFAULT_GRID_PADDING;

  if (tuning.sizing === "cells") {
    const cellWidth = isSize(tuning.cellWidth) ? tuning.cellWidth : DEFAULT_CELL_SIZE;
    const cellHeight = isSize(tuning.cellHeight) ? tuning.cellHeight : DEFAULT_CELL_SIZE;
    const unchanged =
      gridGap === tuning.gridGap &&
      gridPadding === tuning.gridPadding &&
      cellWidth === tuning.cellWidth &&
      cellHeight === tuning.cellHeight;
    return unchanged ? tuning : { ...tuning, gridGap, gridPadding, cellWidth, cellHeight };
  }

  // The frame, less the padding at both ends and the gaps between the cells,
  // shared out among the cells.
  const cellIn = (frame: unknown, count: number) => {
    if (!isSize(frame)) return DEFAULT_CELL_SIZE;
    const cell = (frame - 2 * gridPadding - Math.max(0, count - 1) * gridGap) / count;
    return isSize(cell) ? cell : DEFAULT_CELL_SIZE;
  };
  const { previewWidth, previewHeight, ...rest } = tuning;
  return {
    ...rest,
    gridGap,
    gridPadding,
    cellWidth: cellIn(previewWidth, cols),
    cellHeight: cellIn(previewHeight, rows),
    sizing: "cells",
  };
}

/** A grid's size in pixels, inside the 1 px border around it. */
export interface GridPixelSize {
  width: number;
  height: number;
}

/** Drops floating-point dust, so that 7 cells of 115/7 px make 115 px rather
 * than 114.99999999999999. */
function tidy(px: number): number {
  return Math.round(px * 1e6) / 1e6;
}

/** `count` cells of `cell` px, the gaps between them and the padding at both
 * ends. */
function span(count: number, cell: number, gap: number, padding: number): number {
  return tidy(count * cell + Math.max(0, count - 1) * gap + 2 * padding);
}

/** The grid's size in pixels: its columns of cellWidth and rows of
 * cellHeight, the gaps between them and the padding around them. A design
 * has this size on every screen, and every view of the grid uses it: the
 * exported script, both previews, the editor's readout and the background
 * image's resolution. Numbers that are missing or unusable count as a new
 * survey's, as cellSizedTuning repairs them. */
export function gridPixelSize(config: {
  layout: Pick<LayoutConfig, "rows" | "cols">;
  tuning: Pick<TuningConfig, "cellWidth" | "cellHeight" | "gridGap" | "gridPadding">;
}): GridPixelSize {
  const { layout, tuning } = config;
  const gap = isSpacing(tuning.gridGap) ? tuning.gridGap : DEFAULT_GRID_GAP;
  const padding = isSpacing(tuning.gridPadding) ? tuning.gridPadding : DEFAULT_GRID_PADDING;
  const cellWidth = isSize(tuning.cellWidth) ? tuning.cellWidth : DEFAULT_CELL_SIZE;
  const cellHeight = isSize(tuning.cellHeight) ? tuning.cellHeight : DEFAULT_CELL_SIZE;
  return {
    width: span(layout.cols, cellWidth, gap, padding),
    height: span(layout.rows, cellHeight, gap, padding),
  };
}

/** "290 × 290 px": the grid's size as the editor says it, in whole pixels. */
export function gridSizeText(size: GridPixelSize): string {
  return `${Math.round(size.width)} × ${Math.round(size.height)} px`;
}

/** Whether respondents on phones scroll the grid sideways: the grid and its
 * border are wider than Qualtrics' phone view. The exported script decides
 * it the same way, so one pixel too many (a rounding pixel) does not count:
 * a grid 291 px wide still fits, 292 px does not. */
export function scrollsOnPhone(size: GridPixelSize): boolean {
  return size.width + GRID_BORDERS - PHONE_WIDTH > 1;
}

/** The longest side, in pixels, an uploaded background image is reduced to:
 * twice the grid's size, so it stays sharp on high-density screens, never
 * less than the 1100 px every grid's background got before cell sizes, so a
 * grid made larger later still has a sharp one, and never more than 4096 px
 * (MAX_BACKGROUND_IMAGE_DIM), so even the largest grid's image can be drawn
 * and saved. */
export function backgroundImageMaxDim(size: GridPixelSize): number {
  const twice = Math.ceil(2 * Math.max(size.width, size.height));
  return Math.min(MAX_BACKGROUND_IMAGE_DIM, Math.max(MIN_BACKGROUND_IMAGE_DIM, twice));
}
