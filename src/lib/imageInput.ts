// Client-side image → compressed base64 data URI.
//
// Images picked by the user are downscaled and re-encoded entirely in the
// browser, then stored as a `data:` URI directly in the survey config. Because
// the bytes travel inside the survey (and the exported Qualtrics QSF), there is
// no external host or storage to depend on — the survey renders images on its
// own. Downscaling/compression keeps each embedded string small so many images
// don't bloat the QSF or exceed the ~5MB localStorage cap for anonymous saves.

export interface FileToDataUriOptions {
  /** Longest side of the output image, in pixels. Defaults to 512. */
  maxDim?: number;
  /** Lossy quality for JPEG/WebP output, 0–1. Defaults to 0.8. */
  quality?: number;
  /** Reject source files larger than this many bytes. Defaults to 15MB. */
  maxSourceBytes?: number;
}

const DEFAULTS: Required<FileToDataUriOptions> = {
  maxDim: 512,
  quality: 0.8,
  maxSourceBytes: 15 * 1024 * 1024,
};

let webpSupported: boolean | null = null;

/** Whether this browser's canvas can encode WebP. Cached after first check. */
function canEncodeWebp(): boolean {
  if (webpSupported != null) return webpSupported;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpSupported = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupported = false;
  }
  return webpSupported;
}

/**
 * How an uploaded image is re-encoded. Vector images (SVG) have no useful
 * pixel size of their own, so they are drawn at the full size limit; raster
 * images are only ever shrunk. Every format that can carry transparency keeps
 * it: WebP where the browser can encode it, otherwise PNG. JPEG and HEIC
 * sources, which have no transparency, become JPEG. A planned PNG can still
 * end up as JPEG once the pixels are known to be opaque (see finalDataUri).
 */
export function encodingPlan(
  type: string,
  width: number,
  height: number,
  maxDim: number,
  webp: boolean,
): { width: number; height: number; mime: string } {
  const longest = Math.max(width, height);
  const scale = type === "image/svg+xml" ? maxDim / longest : Math.min(1, maxDim / longest);
  const opaque = /^image\/(jpe?g|hei[cf])$/.test(type);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    mime: webp ? "image/webp" : opaque ? "image/jpeg" : "image/png",
  };
}

/** True when no pixel is even partly transparent. `rgba` is canvas pixel
 * data: four bytes per pixel, alpha last. */
export function isFullyOpaque(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) return false;
  }
  return true;
}

/**
 * The data URI to keep for a drawn image. A browser that cannot encode WebP
 * falls back to lossless PNG, and a lossless photo can take megabytes of the
 * ~5MB browser storage that holds every saved survey. So when the planned PNG
 * has no transparent pixels, the image is also encoded as JPEG and the
 * shorter of the two is kept. SVGs stay PNG: their sharp edges and flat
 * colours blur in JPEG. `encode` makes a data URI in the given type; the
 * pixels are only checked, and JPEG only made, when it could be used.
 */
export function finalDataUri(
  planMime: string,
  sourceType: string,
  encode: (mime: string) => string,
  isOpaque: () => boolean,
): string {
  const planned = encode(planMime);
  if (planMime !== "image/png" || sourceType === "image/svg+xml" || !isOpaque()) {
    return planned;
  }
  const jpeg = encode("image/jpeg");
  return jpeg.length < planned.length ? jpeg : planned;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read that image file."));
    img.src = src;
  });
}

/**
 * Read an image file, fit it to `maxDim` (see encodingPlan) and return a
 * compressed base64 data URI. Where the browser can encode WebP, every image
 * becomes WebP, which keeps transparency. Elsewhere (such as Safari) JPEG
 * and HEIC sources become JPEG and other sources PNG, unless the PNG has no
 * transparent pixels and JPEG is smaller (see finalDataUri).
 */
export async function fileToDataUri(
  file: File,
  options?: FileToDataUriOptions,
): Promise<string> {
  const { maxDim, quality, maxSourceBytes } = { ...DEFAULTS, ...options };

  if (!file.type.startsWith("image/")) {
    throw new Error("That file isn't an image.");
  }
  if (file.size > maxSourceBytes) {
    const mb = Math.round(maxSourceBytes / (1024 * 1024));
    throw new Error(`That image is too large (max ${mb}MB before compression).`);
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);

    const { width, height } = img;
    if (!width || !height) {
      throw new Error("That image appears to be empty.");
    }

    const plan = encodingPlan(file.type, width, height, maxDim, canEncodeWebp());
    const outW = plan.width;
    const outH = plan.height;

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't process that image.");
    ctx.drawImage(img, 0, 0, outW, outH);

    // PNG ignores the quality argument; that's fine.
    return finalDataUri(
      plan.mime,
      file.type,
      (mime) => canvas.toDataURL(mime, quality),
      () => isFullyOpaque(ctx.getImageData(0, 0, outW, outH).data),
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Approximate decoded byte size of a base64 data URI (0 for plain URLs/empty). */
export function dataUriByteSize(value: string): number {
  if (!value.startsWith("data:")) return 0;
  const commaIdx = value.indexOf(",");
  if (commaIdx === -1) return 0;
  const data = value.slice(commaIdx + 1);
  // Base64 encodes 3 bytes per 4 chars; subtract padding.
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - padding);
}

/** Human-readable size, e.g. "12 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
