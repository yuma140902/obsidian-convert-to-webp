import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERT_OPTIONS, loadConvertOptions } from "./settings";

describe("loadConvertOptions", () => {
  it("loads saved options", () => {
    expect(
      loadConvertOptions({
        resizeMode: "width",
        size: 640,
        lossless: true,
        quality: 95,
      }),
    ).toEqual({
      resizeMode: "width",
      size: 640,
      lossless: true,
      quality: 95,
    });
  });

  it("falls back for invalid persisted values", () => {
    expect(
      loadConvertOptions({
        resizeMode: "invalid",
        size: -1,
        lossless: "yes",
        quality: 200,
      }),
    ).toEqual({
      ...DEFAULT_CONVERT_OPTIONS,
      quality: 100,
    });
  });
});
