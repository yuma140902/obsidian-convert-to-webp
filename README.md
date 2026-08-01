# Convert to WebP

An Obsidian plugin that converts PNG, JPEG, and WebP images in your vault to WebP.

## Usage

1. Right-click an image file in the file explorer, or place the cursor in an embedded image link and open the editor context menu.
2. Choose **Convert to WebP**.
3. Select a resize mode, target size, encoding mode, and quality while checking the preview and estimated file size.
4. Choose **Convert**.

For PNG and JPEG sources, the plugin changes the extension to `.webp`, updates the link in the current note, and replaces the image data. Existing WebP files are overwritten in place. Conversion is cancelled if the target path already exists. If Obsidian's metadata cache reports that other notes also reference the image, the conversion dialog warns you; those other notes are intentionally left unchanged.

## Installation from source

```sh
pnpm install
pnpm build
```

Copy `manifest.json`, `main.js`, and `styles.css` into `<vault>/.obsidian/plugins/convert-to-webp/`, then enable the plugin in Obsidian.

## Debugging

Open **Developer tools** from Obsidian's command palette, select the **Console** tab, and filter for `[Convert to WebP]`. The plugin logs each step from loading and button clicks through encoding, renaming, and writing the converted file. Errors include their stack trace.
