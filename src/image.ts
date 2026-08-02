export type ResizeMode =
  | "none"
  | "long-edge"
  | "short-edge"
  | "width"
  | "height";

export interface ConvertOptions {
  resizeMode: ResizeMode;
  size: number;
  lossless: boolean;
  quality: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

import { debugError, debugLog } from "./debug";

let encoderReady: Promise<void> | undefined;

async function initializeEncoder(): Promise<void> {
  if (!encoderReady) {
    debugLog("Initializing WebP encoder");
    encoderReady = (async () => {
      const [{ init }, { simd }, plainWasm, simdWasm] = await Promise.all([
        import("@jsquash/webp/encode.js"),
        import("wasm-feature-detect"),
        import("@jsquash/webp/codec/enc/webp_enc.wasm"),
        import("@jsquash/webp/codec/enc/webp_enc_simd.wasm"),
      ]);
      const wasmBytes = (await simd()) ? simdWasm.default : plainWasm.default;
      debugLog("WebP Wasm selected", { byteLength: wasmBytes.byteLength });
      const initializeWithModule = init as unknown as (
        module: WebAssembly.Module,
        overrides: { locateFile: (path: string) => string },
      ) => Promise<unknown>;
      await initializeWithModule(
        await WebAssembly.compile(Uint8Array.from(wasmBytes).buffer),
        // The Wasm module is instantiated from the bundled bytes above. Supplying
        // locateFile prevents Emscripten from evaluating `new URL(...,
        // import.meta.url)`, which is invalid in Obsidian's CommonJS plug-in bundle.
        { locateFile: (path: string) => path },
      );
      debugLog("WebP encoder initialized");
    })().catch((error: unknown) => {
      encoderReady = undefined;
      debugError("WebP encoder initialization failed", error);
      throw error;
    });
  }
  await encoderReady;
}

export function calculateDimensions(
  source: Dimensions,
  mode: ResizeMode,
  requestedSize: number,
): Dimensions {
  if (mode === "none" || !Number.isFinite(requestedSize) || requestedSize <= 0)
    return source;

  let scale: number;
  if (mode === "width") scale = requestedSize / source.width;
  else if (mode === "height") scale = requestedSize / source.height;
  else if (mode === "long-edge")
    scale = requestedSize / Math.max(source.width, source.height);
  else scale = requestedSize / Math.min(source.width, source.height);

  // This plug-in only shrinks images; it never upscales them.
  scale = Math.min(1, scale);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

export function replaceImageExtension(path: string): string {
  if (/\.webp$/i.test(path)) return path;
  return path.replace(/\.(?:bmp|png|jpe?g)$/i, ".webp");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function formatPreviewInfo(
  originalDimensions: Dimensions,
  originalBytes: number,
  convertedDimensions: Dimensions,
  convertedBytes: number,
): string {
  return `Original: ${originalDimensions.width} × ${originalDimensions.height}px · ${formatBytes(originalBytes)} → WebP: ${convertedDimensions.width} × ${convertedDimensions.height}px · ${formatBytes(convertedBytes)}`;
}

export async function decodeImage(
  data: ArrayBuffer,
  mimeType: string,
): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([data], { type: mimeType }));
}

export async function encodeWebp(
  image: ImageBitmap,
  dimensions: Dimensions,
  options: Pick<ConvertOptions, "lossless" | "quality">,
): Promise<Blob> {
  debugLog("encodeWebp entered", { dimensions, options });
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas 2D is not available.");
  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

  const imageData = context.getImageData(
    0,
    0,
    dimensions.width,
    dimensions.height,
  );
  await initializeEncoder();
  const { default: encode } = await import("@jsquash/webp/encode.js");
  const encoded = await encode(imageData, {
    lossless: options.lossless ? 1 : 0,
    quality: Math.max(0, Math.min(100, options.quality)),
  });
  const blob = new Blob([encoded], { type: "image/webp" });
  debugLog("encodeWebp completed", { blobSize: blob.size });
  return blob;
}
