import { describe, expect, it } from "vitest";
import { parseGridSize, repairGridSize } from "./gridSize";

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
