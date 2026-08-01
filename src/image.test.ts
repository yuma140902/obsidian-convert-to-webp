import { describe, expect, it } from "vitest";
import { calculateDimensions, formatBytes, replaceImageExtension } from "./image";

describe("calculateDimensions", () => {
  it("keeps the original size", () => expect(calculateDimensions({ width: 1200, height: 800 }, "none", 10)).toEqual({ width: 1200, height: 800 }));
  it("resizes by long edge", () => expect(calculateDimensions({ width: 1200, height: 800 }, "long-edge", 600)).toEqual({ width: 600, height: 400 }));
  it("resizes by short edge", () => expect(calculateDimensions({ width: 1200, height: 800 }, "short-edge", 400)).toEqual({ width: 600, height: 400 }));
  it("resizes by width and height", () => {
    expect(calculateDimensions({ width: 1200, height: 800 }, "width", 300)).toEqual({ width: 300, height: 200 });
    expect(calculateDimensions({ width: 1200, height: 800 }, "height", 200)).toEqual({ width: 300, height: 200 });
  });
  it("does not upscale", () => expect(calculateDimensions({ width: 100, height: 50 }, "width", 500)).toEqual({ width: 100, height: 50 }));
});

it("replaces supported extensions", () => {
  expect(replaceImageExtension("Assets/photo.JPEG")).toBe("Assets/photo.webp");
  expect(replaceImageExtension("x.png")).toBe("x.webp");
});

it("formats byte sizes", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1536)).toBe("1.5 KB");
});
