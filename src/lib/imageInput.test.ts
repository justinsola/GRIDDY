import { describe, expect, it } from "vitest";
import { encodingPlan } from "./imageInput";

describe("encodingPlan", () => {
  it("draws a small SVG icon at the full size limit instead of a speck", () => {
    expect(encodingPlan("image/svg+xml", 24, 24, 512, true)).toEqual({ width: 512, height: 512, mime: "image/webp" });
  });

  it("only ever shrinks raster images", () => {
    expect(encodingPlan("image/png", 2000, 1000, 512, true)).toMatchObject({ width: 512, height: 256 });
    expect(encodingPlan("image/png", 100, 50, 512, true)).toMatchObject({ width: 100, height: 50 });
  });

  it("keeps transparency when the browser cannot encode WebP", () => {
    expect(encodingPlan("image/svg+xml", 24, 24, 512, false).mime).toBe("image/png");
    expect(encodingPlan("image/webp", 300, 300, 512, false).mime).toBe("image/png");
    expect(encodingPlan("image/gif", 300, 300, 512, false).mime).toBe("image/png");
    expect(encodingPlan("image/jpeg", 300, 300, 512, false).mime).toBe("image/jpeg");
  });
});
