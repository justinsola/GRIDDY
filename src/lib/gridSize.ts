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
