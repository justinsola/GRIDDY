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
 * 600; a new survey's cells are 100 × 100 px. */
export const MIN_CELL_SIZE = 20;
export const MAX_CELL_SIZE = 600;
export const DEFAULT_CELL_SIZE = 100;
export const CELL_SIZE_MESSAGE = "Use a whole number from 20 to 600";

/** About the width, in pixels, that Qualtrics gives a question on a phone
 * (339 px in its phone preview). A wider grid scrolls sideways there. */
export const PHONE_WIDTH = 340;
/** Cells narrower or shorter than this, in pixels, are hard to tap. */
export const MIN_TAP_SIZE = 44;

const DEFAULT_GRID_GAP = 10;
const DEFAULT_GRID_PADDING = 0;
/** The background image resolution every grid had before cell sizes. */
const MIN_BACKGROUND_IMAGE_DIM = 1100;

/** The cell width or height typed in the editor, or null when it is not a
 * whole number from 20 to 600. */
export function parseCellSize(raw: string): number | null {
  const text = raw.trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const n = Number(text);
  return n >= MIN_CELL_SIZE && n <= MAX_CELL_SIZE ? n : null;
}

/** The tuning of a new survey: 100 × 100 px cells, 10 px apart. */
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

/** "320 × 320 px": the grid's size as the editor says it, in whole pixels. */
export function gridSizeText(size: GridPixelSize): string {
  return `${Math.round(size.width)} × ${Math.round(size.height)} px`;
}

/** The longest side, in pixels, an uploaded background image is reduced to:
 * twice the grid's size, so it stays sharp on high-density screens, and never
 * less than the 1100 px every grid's background got before cell sizes, so a
 * grid made larger later still has a sharp one. */
export function backgroundImageMaxDim(size: GridPixelSize): number {
  return Math.max(MIN_BACKGROUND_IMAGE_DIM, Math.ceil(2 * Math.max(size.width, size.height)));
}
