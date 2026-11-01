import { describe, expect, it, vi } from "vitest";
import { encodingPlan, finalDataUri, isFullyOpaque } from "./imageInput";

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

describe("isFullyOpaque", () => {
  it("checks the alpha byte of every pixel", () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
    expect(isFullyOpaque(pixels)).toBe(true);
    pixels[7] = 254;
    expect(isFullyOpaque(pixels)).toBe(false);
  });

  it("does not mistake a colour byte of 255 or 0 for alpha", () => {
    expect(isFullyOpaque(new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 255, 255]))).toBe(true);
    expect(isFullyOpaque(new Uint8ClampedArray([255, 255, 255, 0]))).toBe(false);
  });
});

describe("finalDataUri", () => {
  // Fake encoder: the string length stands in for the encoded size.
  const encoder = (sizes: Record<string, number>) =>
    vi.fn((mime: string) => `data:${mime};base64,${"A".repeat(sizes[mime])}`);

  it("keeps an opaque raster image as JPEG when that is shorter than PNG", () => {
    const encode = encoder({ "image/png": 3000, "image/jpeg": 400 });
    expect(finalDataUri("image/png", "image/webp", encode, () => true)).toMatch(/^data:image\/jpeg/);
    expect(finalDataUri("image/png", "image/bmp", encode, () => true)).toMatch(/^data:image\/jpeg/);
    expect(finalDataUri("image/png", "image/png", encode, () => true)).toMatch(/^data:image\/jpeg/);
  });

  it("keeps PNG when JPEG would not be shorter", () => {
    const encode = encoder({ "image/png": 400, "image/jpeg": 3000 });
    expect(finalDataUri("image/png", "image/png", encode, () => true)).toMatch(/^data:image\/png/);
  });

  it("keeps PNG for an image with any transparency, without making a JPEG", () => {
    const encode = encoder({ "image/png": 3000, "image/jpeg": 400 });
    expect(finalDataUri("image/png", "image/png", encode, () => false)).toMatch(/^data:image\/png/);
    expect(encode).not.toHaveBeenCalledWith("image/jpeg");
  });

  it("keeps an SVG as PNG without reading its pixels", () => {
    const encode = encoder({ "image/png": 3000, "image/jpeg": 400 });
    const isOpaque = vi.fn(() => true);
    expect(finalDataUri("image/png", "image/svg+xml", encode, isOpaque)).toMatch(/^data:image\/png/);
    expect(isOpaque).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalledWith("image/jpeg");
  });

  it("uses the planned WebP or JPEG as is", () => {
    const encode = encoder({ "image/webp": 3000, "image/jpeg": 400 });
    const isOpaque = vi.fn(() => true);
    expect(finalDataUri("image/webp", "image/png", encode, isOpaque)).toMatch(/^data:image\/webp/);
    expect(finalDataUri("image/jpeg", "image/jpeg", encode, isOpaque)).toMatch(/^data:image\/jpeg/);
    expect(encode).toHaveBeenCalledTimes(2);
    expect(isOpaque).not.toHaveBeenCalled();
  });
});
