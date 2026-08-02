import {
  type App,
  type ButtonComponent,
  Modal,
  Notice,
  Setting,
  type TextComponent,
  type TFile,
} from "obsidian";
import { debugError, debugLog } from "./debug";
import {
  type ConvertOptions,
  calculateDimensions,
  type Dimensions,
  decodeImage,
  encodeWebp,
  formatPreviewInfo,
  type ResizeMode,
} from "./image";

const MIME_TYPES: Record<string, string> = {
  bmp: "image/bmp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export class ConvertModal extends Modal {
  private readonly options: ConvertOptions;
  private original?: ImageBitmap;
  private originalBytes?: number;
  private dimensions?: Dimensions;
  private previewBlob?: Blob;
  private previewUrl?: string;
  private previewImage?: HTMLImageElement;
  private previewInfo?: HTMLElement;
  private sizeInput?: TextComponent;
  private convertButton?: ButtonComponent;
  private generation = 0;
  private submitting = false;

  constructor(
    app: App,
    private readonly file: TFile,
    initialOptions: ConvertOptions,
    private readonly currentNote: TFile | null,
    private readonly otherReferringNotes: TFile[],
    private readonly onConvert: (
      blob: Blob,
      options: ConvertOptions,
    ) => Promise<void>,
  ) {
    super(app);
    this.options = { ...initialOptions };
  }

  override onOpen(): void {
    debugLog("Modal opened", {
      path: this.file.path,
      initialOptions: this.options,
    });
    this.modalEl.addClass("convert-to-webp-modal");
    this.titleEl.setText(`Convert ${this.file.name} to WebP`);
    this.render();
    void this.loadImage();
  }

  private render(): void {
    if (this.otherReferringNotes.length > 0) {
      const names = this.otherReferringNotes
        .slice(0, 3)
        .map((note) => note.path)
        .join(", ");
      const remaining = this.otherReferringNotes.length - 3;
      this.contentEl.createDiv({
        cls: "convert-to-webp-warning",
        text: `Warning: ${this.otherReferringNotes.length} other note(s) reference this image. Their links will not be changed: ${names}${remaining > 0 ? `, and ${remaining} more` : ""}`,
      });
    } else if (!this.currentNote) {
      this.contentEl.createDiv({
        cls: "convert-to-webp-warning",
        text: "Warning: No current Markdown note was found, so no image link will be changed.",
      });
    }
    const preview = this.contentEl.createDiv({
      cls: "convert-to-webp-preview",
    });
    this.previewImage = preview.createEl("img", {
      attr: { alt: "WebP conversion preview" },
    });
    this.previewInfo = preview.createDiv({
      cls: "convert-to-webp-preview-info",
      text: "Preparing preview…",
    });

    new Setting(this.contentEl).setName("Resize").addDropdown((dropdown) =>
      dropdown
        .addOptions({
          none: "Keep original size",
          "long-edge": "Long edge",
          "short-edge": "Short edge",
          width: "Width",
          height: "Height",
        })
        .setValue(this.options.resizeMode)
        .onChange((value) => {
          this.options.resizeMode = value as ResizeMode;
          this.sizeInput?.setDisabled(value === "none");
          void this.refreshPreview();
        }),
    );

    new Setting(this.contentEl)
      .setName("Size")
      .setDesc("Pixels; images are never enlarged")
      .addText((text) => {
        this.sizeInput = text;
        text
          .setValue(String(this.options.size))
          .setDisabled(this.options.resizeMode === "none")
          .onChange((value) => {
            this.options.size = Number(value);
            void this.refreshPreview();
          });
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.inputEl.step = "1";
      });

    new Setting(this.contentEl).setName("Encoding").addDropdown((dropdown) =>
      dropdown
        .addOptions({ lossy: "Lossy", lossless: "Lossless" })
        .setValue(this.options.lossless ? "lossless" : "lossy")
        .onChange((value) => {
          this.options.lossless = value === "lossless";
          void this.refreshPreview();
        }),
    );

    new Setting(this.contentEl)
      .setName("Quality")
      .setDesc("Used in both lossy and lossless modes")
      .addSlider((slider) =>
        slider
          .setLimits(0, 100, 1)
          .setDynamicTooltip()
          .setValue(this.options.quality)
          .onChange((value) => {
            this.options.quality = value;
            void this.refreshPreview();
          }),
      );

    const buttons = new Setting(this.contentEl);
    buttons.addButton((button) =>
      button.setButtonText("Cancel").onClick(() => this.close()),
    );
    buttons.addButton((button) => {
      this.convertButton = button;
      button
        .setButtonText("Convert")
        .setCta()
        .setDisabled(true)
        .onClick(() => void this.submit());
      button.buttonEl.addEventListener("pointerdown", () => {
        debugLog("Convert button pointerdown observed", {
          disabled: button.buttonEl.disabled,
          hasPreviewBlob: Boolean(this.previewBlob),
        });
      });
    });
  }

  private async loadImage(): Promise<void> {
    debugLog("Loading source image", { path: this.file.path });
    try {
      const data = await this.app.vault.readBinary(this.file);
      this.originalBytes = data.byteLength;
      debugLog("Source image read", {
        path: this.file.path,
        byteLength: data.byteLength,
      });
      this.original = await decodeImage(
        data,
        MIME_TYPES[this.file.extension.toLowerCase()] ??
          "application/octet-stream",
      );
      debugLog("Source image decoded", {
        width: this.original.width,
        height: this.original.height,
      });
      await this.refreshPreview();
    } catch (error) {
      debugError("Loading source image failed", error);
      this.showError(error);
    }
  }

  private async refreshPreview(): Promise<void> {
    if (!this.original || this.originalBytes === undefined || !this.previewInfo)
      return;
    const generation = ++this.generation;
    debugLog("Preview encoding started", { generation, options: this.options });
    this.convertButton?.setDisabled(true);
    this.previewInfo.setText("Encoding preview…");
    try {
      this.dimensions = calculateDimensions(
        { width: this.original.width, height: this.original.height },
        this.options.resizeMode,
        this.options.size,
      );
      const blob = await encodeWebp(
        this.original,
        this.dimensions,
        this.options,
      );
      if (generation !== this.generation) {
        debugLog("Discarding stale preview", {
          generation,
          currentGeneration: this.generation,
        });
        return;
      }
      this.previewBlob = blob;
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = URL.createObjectURL(blob);
      if (this.previewImage) this.previewImage.src = this.previewUrl;
      this.previewInfo.setText(
        formatPreviewInfo(
          { width: this.original.width, height: this.original.height },
          this.originalBytes,
          this.dimensions,
          blob.size,
        ),
      );
      this.convertButton?.setDisabled(false);
      debugLog("Preview ready; Convert button enabled", {
        generation,
        width: this.dimensions.width,
        height: this.dimensions.height,
        blobSize: blob.size,
      });
    } catch (error) {
      if (generation === this.generation) {
        debugError("Preview encoding failed", error);
        this.showError(error);
      }
    }
  }

  private async submit(): Promise<void> {
    debugLog("Convert button handler entered", {
      hasPreviewBlob: Boolean(this.previewBlob),
      submitting: this.submitting,
      blobSize: this.previewBlob?.size,
    });
    if (!this.previewBlob || this.submitting) {
      debugLog("Convert request ignored", {
        hasPreviewBlob: Boolean(this.previewBlob),
        submitting: this.submitting,
      });
      return;
    }
    this.submitting = true;
    this.convertButton?.setDisabled(true);
    this.previewInfo?.setText("Converting…");
    try {
      debugLog("Calling plugin conversion callback");
      await this.onConvert(this.previewBlob, { ...this.options });
      debugLog("Conversion callback resolved; closing modal");
      this.close();
    } catch (error) {
      debugError("Conversion callback failed", error);
      this.showError(error);
      this.convertButton?.setDisabled(false);
    } finally {
      this.submitting = false;
    }
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.previewInfo?.setText(`Error: ${message}`);
    new Notice(`Convert to WebP: ${message}`);
  }

  override onClose(): void {
    debugLog("Modal closed", { path: this.file.path });
    this.original?.close();
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.contentEl.empty();
  }
}
