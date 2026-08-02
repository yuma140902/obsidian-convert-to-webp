import type { ConvertOptions, ResizeMode } from "./image";

export const DEFAULT_CONVERT_OPTIONS: ConvertOptions = {
  resizeMode: "none",
  size: 1000,
  lossless: false,
  quality: 75,
};

const RESIZE_MODES = new Set<ResizeMode>([
  "none",
  "long-edge",
  "short-edge",
  "width",
  "height",
]);

export function loadConvertOptions(data: unknown): ConvertOptions {
  if (!data || typeof data !== "object") return { ...DEFAULT_CONVERT_OPTIONS };
  const value = data as Partial<ConvertOptions>;
  return {
    resizeMode: RESIZE_MODES.has(value.resizeMode as ResizeMode)
      ? (value.resizeMode as ResizeMode)
      : DEFAULT_CONVERT_OPTIONS.resizeMode,
    size:
      typeof value.size === "number" &&
      Number.isFinite(value.size) &&
      value.size >= 1
        ? Math.round(value.size)
        : DEFAULT_CONVERT_OPTIONS.size,
    lossless:
      typeof value.lossless === "boolean"
        ? value.lossless
        : DEFAULT_CONVERT_OPTIONS.lossless,
    quality:
      typeof value.quality === "number" && Number.isFinite(value.quality)
        ? Math.max(0, Math.min(100, Math.round(value.quality)))
        : DEFAULT_CONVERT_OPTIONS.quality,
  };
}
