import { Menu, Notice, Plugin, TAbstractFile, TFile, type Editor } from "obsidian";
import { replaceImageExtension } from "./image";
import { rewriteImageLinks } from "./links";
import { ConvertModal } from "./modal";

const SUPPORTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

export default class ConvertToWebpPlugin extends Plugin {
  override onload(): void {
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => this.addFileMenuItem(menu, file)));
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor, view) => {
      const file = this.imageAtCursor(editor, view);
      if (file) this.addConvertItem(menu, file);
    }));
  }

  private addFileMenuItem(menu: Menu, abstractFile: TAbstractFile): void {
    if (abstractFile instanceof TFile && this.isSupported(abstractFile)) this.addConvertItem(menu, abstractFile);
  }

  private addConvertItem(menu: Menu, file: TFile): void {
    menu.addItem((item) => item
      .setTitle("Convert to WebP")
      .setIcon("image")
      .onClick(() => new ConvertModal(this.app, file, (blob) => this.convert(file, blob)).open()));
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

  private async convert(source: TFile, blob: Blob): Promise<void> {
    const targetPath = replaceImageExtension(source.path);
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing && existing !== source) {
      throw new Error(`A file already exists at ${targetPath}.`);
    }

    const bytes = await blob.arrayBuffer();
    if (source.path === targetPath) {
      await this.app.vault.modifyBinary(source, bytes);
    } else {
      await this.app.vault.createBinary(targetPath, bytes);
      const changedNotes: Array<{ file: TFile; content: string }> = [];
      try {
        const notes = this.app.vault.getMarkdownFiles();
        for (const note of notes) {
          const original = await this.app.vault.read(note);
          const updated = rewriteImageLinks(original, note.path, source, this.app.metadataCache);
          if (updated !== original) {
            await this.app.vault.modify(note, updated);
            changedNotes.push({ file: note, content: original });
          }
        }
        await this.app.fileManager.trashFile(source);
      } catch (error) {
        await Promise.allSettled(changedNotes.map(({ file, content }) => this.app.vault.modify(file, content)));
        const created = this.app.vault.getAbstractFileByPath(targetPath);
        if (created) await this.app.fileManager.trashFile(created);
        throw error;
      }
    }
    new Notice(`Converted to ${targetPath}`);
  }
}
