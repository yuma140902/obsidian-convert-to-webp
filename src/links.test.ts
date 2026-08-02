import type { MetadataCache, TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { rewriteImageLinks } from "./links";

const source = { path: "assets/My image.png" } as TFile;
const metadataCache = {
  getFirstLinkpathDest(link: string) {
    return ["assets/My image.png", "My image.png"].includes(link)
      ? source
      : null;
  },
} as unknown as MetadataCache;

describe("rewriteImageLinks", () => {
  it("rewrites wiki and markdown embeds while preserving aliases and titles", () => {
    const input = [
      "![[assets/My image.png|wide]]",
      '![alt](assets/My%20image.png "title")',
      "[ordinary link](assets/My%20image.png)",
      "![[another.png]]",
    ].join("\n");
    expect(rewriteImageLinks(input, "note.md", source, metadataCache)).toBe(
      [
        "![[assets/My image.webp|wide]]",
        '![alt](assets/My%20image.webp "title")',
        "[ordinary link](assets/My%20image.png)",
        "![[another.png]]",
      ].join("\n"),
    );
  });
});

it("rewrites embedded BMP links", () => {
  const bmpSource = { path: "assets/scan.bmp" } as TFile;
  const bmpMetadataCache = {
    getFirstLinkpathDest: (link: string) =>
      ["assets/scan.bmp", "scan.bmp"].includes(link) ? bmpSource : null,
  } as unknown as MetadataCache;

  expect(
    rewriteImageLinks(
      "![[assets/scan.bmp]]\n![scan](assets/scan.bmp)",
      "note.md",
      bmpSource,
      bmpMetadataCache,
    ),
  ).toBe("![[assets/scan.webp]]\n![scan](assets/scan.webp)");
});
