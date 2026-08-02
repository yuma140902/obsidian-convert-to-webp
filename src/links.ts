import type { MetadataCache, TFile } from "obsidian";

function resolvesTo(
  metadataCache: MetadataCache,
  link: string,
  notePath: string,
  source: TFile,
): boolean {
  try {
    const decoded = decodeURIComponent(link);
    return (
      metadataCache.getFirstLinkpathDest(decoded, notePath)?.path ===
      source.path
    );
  } catch {
    return (
      metadataCache.getFirstLinkpathDest(link, notePath)?.path === source.path
    );
  }
}

/** Rewrites only embedded links that Obsidian resolves to the converted file. */
export function rewriteImageLinks(
  content: string,
  notePath: string,
  source: TFile,
  metadataCache: MetadataCache,
): string {
  const wiki = /!\[\[([^|\]#]+)(#[^|\]]*)?(\|[^\]]*)?\]\]/g;
  const markdown = /!\[([^\]]*)\]\((<)?([^\s)>]+)(>)?([^)]*)\)/g;

  content = content.replace(
    wiki,
    (whole, path: string, subpath = "", alias = "") => {
      if (!resolvesTo(metadataCache, path, notePath, source)) return whole;
      return `![[${path.replace(/\.(?:bmp|png|jpe?g|webp)$/i, ".webp")}${subpath}${alias}]]`;
    },
  );

  return content.replace(
    markdown,
    (
      whole,
      alt: string,
      opening = "",
      path: string,
      closing = "",
      suffix = "",
    ) => {
      if (!resolvesTo(metadataCache, path, notePath, source)) return whole;
      return `![${alt}](${opening}${path.replace(/\.(?:bmp|png|jpe?g|webp)$/i, ".webp")}${closing}${suffix})`;
    },
  );
}
