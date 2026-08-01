import { Menu, Notice, Plugin, TAbstractFile, TFile, type Editor } from "obsidian";
import { debugError, debugLog } from "./debug";
import { replaceImageExtension, type ConvertOptions } from "./image";
import { rewriteImageLinks } from "./links";
import { ConvertModal } from "./modal";
import { DEFAULT_CONVERT_OPTIONS, loadConvertOptions } from "./settings";

const SUPPORTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

export default class ConvertToWebpPlugin extends Plugin {
  private options: ConvertOptions = { ...DEFAULT_CONVERT_OPTIONS };

  override async onload(): Promise<void> {
    debugLog("Plugin loading", { version: this.manifest.version });
    this.options = loadConvertOptions(await this.loadData());
    debugLog("Settings loaded", this.options);
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
      const activeFile = this.app.workspace.getActiveFile();
      const currentNote = activeFile?.extension === "md" ? activeFile : null;
      this.addFileMenuItem(menu, file, currentNote);
    }));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, view) => {
      const file = this.imageAtCursor(editor, view);
      if (file) this.addConvertItem(menu, file, view.file);
    }));
    debugLog("Plugin loaded; context-menu handlers registered");
  }

  private addFileMenuItem(menu: Menu, abstractFile: TAbstractFile, currentNote: TFile | null): void {
    if (abstractFile instanceof TFile && this.isSupported(abstractFile)) {
      this.addConvertItem(menu, abstractFile, currentNote);
    }
  }

  private addConvertItem(menu: Menu, file: TFile, currentNote: TFile | null): void {
    debugLog("Adding context-menu item", { path: file.path, currentNote: currentNote?.path ?? null });
    menu.addItem((item) => item
      .setTitle("Convert to WebP")
      .setIcon("image")
      .onClick(() => {
        const referringNotes = this.getReferringNotes(file);
        const otherReferringNotes = referringNotes.filter((note) => note.path !== currentNote?.path);
        debugLog("Context-menu item clicked", {
          path: file.path,
          currentNote: currentNote?.path ?? null,
          referringNotes: referringNotes.map((note) => note.path),
          otherReferringNotes: otherReferringNotes.map((note) => note.path)
        });
        new ConvertModal(
          this.app,
          file,
          this.options,
          currentNote,
          otherReferringNotes,
          (blob, options) => this.convertAndRemember(file, blob, options, currentNote)
        ).open();
      }));
  }

  private getReferringNotes(image: TFile): TFile[] {
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    return Object.entries(resolvedLinks)
      .filter(([, destinations]) => (destinations[image.path] ?? 0) > 0)
      .map(([notePath]) => this.app.vault.getFileByPath(notePath))
      .filter((note): note is TFile => note !== null && note.extension === "md");
  }

  private async convertAndRemember(
    source: TFile,
    blob: Blob,
    options: ConvertOptions,
    currentNote: TFile | null
  ): Promise<void> {
    debugLog("Conversion callback started", { path: source.path, blobSize: blob.size, options });
    await this.convert(source, blob, currentNote);
    debugLog("Image conversion finished; saving settings");
    this.options = { ...options };
    try {
      await this.saveData(this.options);
    } catch (error) {
      debugError("Failed to save the last-used settings", error);
      new Notice("Converted successfully, but the settings could not be saved.");
    }
  }

  private imageAtCursor(editor: Editor, view: { file: TFile | null }): TFile | null {
    const cursor = editor.getCursor();
    const line = editor.getLine(cursor.line);
    const linkRegex = /!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)/g;
    for (const match of line.matchAll(linkRegex)) {
      const start = match.index;
      if (cursor.ch < start || cursor.ch > start + match[0].length) continue;
      const wiki = /^!\[\[([^|\]#]+)/.exec(match[0]);
      const markdown = /^!\[[^\]]*\]\(<?([^\s)>]+)/.exec(match[0]);
      const link = wiki?.[1] ?? markdown?.[1];
      if (!link) continue;
      let decoded = link;
      try { decoded = decodeURIComponent(link); } catch { /* Keep the literal link. */ }
      const destination = this.app.metadataCache.getFirstLinkpathDest(decoded, view.file?.path ?? "");
      if (destination && this.isSupported(destination)) return destination;
    }
    return null;
  }

  private isSupported(file: TFile): boolean {
    return SUPPORTED_EXTENSIONS.has(file.extension.toLowerCase());
  }

  private async convert(source: TFile, blob: Blob, currentNote: TFile | null): Promise<void> {
    const sourcePath = source.path;
    const targetPath = replaceImageExtension(sourcePath);
    debugLog("Save operation started", { sourcePath, targetPath, blobSize: blob.size });
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing && existing !== source) {
      debugLog("Save cancelled because target exists", { targetPath });
      throw new Error(`A file already exists at ${targetPath}.`);
    }

    debugLog("Reading encoded Blob into an ArrayBuffer");
    const bytes = await blob.arrayBuffer();
    debugLog("Encoded bytes ready", { byteLength: bytes.byteLength });
    if (sourcePath === targetPath) {
      debugLog("Overwriting existing WebP", { path: sourcePath });
      await this.app.vault.modifyBinary(source, bytes);
      debugLog("Existing WebP overwritten", { path: source.path });
    } else {
      // Resolve links while the original path still exists. Once the file has
      // been renamed, MetadataCache can no longer resolve `image.png` to the
      // source TFile, so collecting these edits after rename would miss them.
      debugLog("Scanning current Markdown note for image links", {
        sourcePath,
        currentNote: currentNote?.path ?? null
      });
      const noteChanges: Array<{ file: TFile; original: string; updated: string }> = [];
      if (currentNote) {
        const original = await this.app.vault.read(currentNote);
        const updated = rewriteImageLinks(original, currentNote.path, source, this.app.metadataCache);
        if (updated !== original) noteChanges.push({ file: currentNote, original, updated });
      }
      debugLog("Current-note link scan finished", { changedNoteCount: noteChanges.length });

      const originalBytes = await this.app.vault.readBinary(source);
      const modifiedNotes: Array<{ file: TFile; original: string }> = [];
      // Vault.rename deliberately avoids FileManager's vault-wide automatic
      // link update. Only the current note is updated below.
      debugLog("Renaming source without vault-wide link updates", { sourcePath, targetPath });
      await this.app.vault.rename(source, targetPath);
      debugLog("Rename finished", { currentPath: source.path });
      try {
        debugLog("Writing converted WebP bytes", { path: source.path });
        await this.app.vault.modifyBinary(source, bytes);
        debugLog("Converted WebP bytes written", { path: source.path });
        for (const change of noteChanges) {
          // Write the known-good updated source even when FileManager already
          // changed the same link; the result is deterministic in both modes.
          await this.app.vault.modify(change.file, change.updated);
          modifiedNotes.push({ file: change.file, original: change.original });
        }
        debugLog("Markdown links updated", { changedNoteCount: modifiedNotes.length });
      } catch (error) {
        debugError("Conversion save failed; rolling back files and links", error);
        await Promise.allSettled(modifiedNotes.map(({ file, original }) => this.app.vault.modify(file, original)));
        try {
          await this.app.vault.modifyBinary(source, originalBytes);
        } catch (rollbackError) {
          debugError("Failed to restore the original image bytes", rollbackError);
        }
        // Rename back after restoring the bytes and note contents.
        try {
          await this.app.vault.rename(source, sourcePath);
        } catch (rollbackError) {
          debugError("Failed to roll back the rename", rollbackError);
        }
        throw error;
      }
    }
    debugLog("Save operation completed", { targetPath });
    new Notice(`Converted to ${targetPath}`);
  }

  override onunload(): void {
    debugLog("Plugin unloaded");
  }
}
