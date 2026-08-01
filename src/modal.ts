import { App, Modal, Notice, Setting, TFile } from "obsidian";
import {
  calculateDimensions,
  decodeImage,
  encodeWebp,
  formatBytes,
  type ConvertOptions,
  type Dimensions,
  type ResizeMode
} from "./image";

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp"
};

export class ConvertModal extends Modal {
  private readonly options: ConvertOptions;
  private original?: ImageBitmap;
  private dimensions?: Dimensions;
  private previewBlob?: Blob;
  private previewUrl?: string;
  private previewImage?: HTMLImageElement;
  private previewInfo?: HTMLElement;
  private sizeInput?: HTMLInputElement;
  private convertButton?: HTMLButtonElement;
  private generation = 0;

  constructor(
    app: App,
    private readonly file: TFile,
    initialOptions: ConvertOptions,
    private readonly onConvert: (blob: Blob, options: ConvertOptions) => Promise<void>
  ) {
    super(app);
    this.options = { ...initialOptions };
  }

  override onOpen(): void {
    this.modalEl.addClass("convert-to-webp-modal");
    this.titleEl.setText(`Convert ${this.file.name} to WebP`);
    this.render();
    void this.loadImage();
  }

  private render(): void {
    const preview = this.contentEl.createDiv({ cls: "convert-to-webp-preview" });
    this.previewImage = preview.createEl("img", { attr: { alt: "WebP conversion preview" } });
    this.previewInfo = preview.createDiv({ cls: "convert-to-webp-preview-info", text: "Preparing preview…" });

    new Setting(this.contentEl).setName("Resize").addDropdown((dropdown) => dropdown
      .addOptions({ none: "Keep original size", "long-edge": "Long edge", "short-edge": "Short edge", width: "Width", height: "Height" })
      .setValue(this.options.resizeMode)
      .onChange((value) => {
        this.options.resizeMode = value as ResizeMode;
        if (this.sizeInput) this.sizeInput.disabled = value === "none";
        void this.refreshPreview();
      }));

    new Setting(this.contentEl).setName("Size").setDesc("Pixels; images are never enlarged").addText((text) => {
      this.sizeInput = text.inputEl;
      text.setValue(String(this.options.size)).setDisabled(this.options.resizeMode === "none").onChange((value) => {
        this.options.size = Number(value);
        void this.refreshPreview();
      });
      text.inputEl.type = "number";
      text.inputEl.min = "1";
      text.inputEl.step = "1";
    });

    new Setting(this.contentEl).setName("Encoding").addDropdown((dropdown) => dropdown
      .addOptions({ lossy: "Lossy", lossless: "Lossless" })
      .setValue(this.options.lossless ? "lossless" : "lossy")
      .onChange((value) => {
        this.options.lossless = value === "lossless";
        void this.refreshPreview();
      }));

    new Setting(this.contentEl).setName("Quality").setDesc("Used in both lossy and lossless modes").addSlider((slider) => slider
      .setLimits(0, 100, 1)
      .setDynamicTooltip()
      .setValue(this.options.quality)
      .onChange((value) => {
        this.options.quality = value;
        void this.refreshPreview();
      }));

    const buttons = new Setting(this.contentEl);
    buttons.addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
    buttons.addButton((button) => {
      this.convertButton = button.buttonEl;
      button.setButtonText("Convert").setCta().setDisabled(true).onClick(() => void this.submit());
    });
  }

  private async loadImage(): Promise<void> {
    try {
      const data = await this.app.vault.readBinary(this.file);
      this.original = await decodeImage(data, MIME_TYPES[this.file.extension.toLowerCase()] ?? "application/octet-stream");
      await this.refreshPreview();
    } catch (error) {
      this.showError(error);
    }
  }

  private async refreshPreview(): Promise<void> {
    if (!this.original || !this.previewInfo) return;
    const generation = ++this.generation;
    this.convertButton?.setAttribute("disabled", "true");
    this.previewInfo.setText("Encoding preview…");
    try {
      this.dimensions = calculateDimensions(
        { width: this.original.width, height: this.original.height },
        this.options.resizeMode,
        this.options.size
      );
      const blob = await encodeWebp(this.original, this.dimensions, this.options);
      if (generation !== this.generation) return;
      this.previewBlob = blob;
      if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = URL.createObjectURL(blob);
      if (this.previewImage) this.previewImage.src = this.previewUrl;
      this.previewInfo.setText(`${this.dimensions.width} × ${this.dimensions.height}px · ${formatBytes(blob.size)}`);
      this.convertButton?.removeAttribute("disabled");
    } catch (error) {
      if (generation === this.generation) this.showError(error);
    }
  }

  private async submit(): Promise<void> {
    if (!this.previewBlob) return;
    this.convertButton?.setAttribute("disabled", "true");
    try {
      await this.onConvert(this.previewBlob, { ...this.options });
      this.close();
    } catch (error) {
      this.showError(error);
      this.convertButton?.removeAttribute("disabled");
    }
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.previewInfo?.setText(`Error: ${message}`);
    new Notice(`Convert to WebP: ${message}`);
  }

  override onClose(): void {
    this.original?.close();
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.contentEl.empty();
  }
}
