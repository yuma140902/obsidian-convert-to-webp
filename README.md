# Convert to WebP

An Obsidian plugin that converts PNG, JPEG, and WebP images in your vault to WebP.

## Usage

1. Right-click an image file in the file explorer, or place the cursor in an embedded image link and open the editor context menu.
2. Choose **Convert to WebP**.
3. Select a resize mode, target size, encoding mode, and quality while checking the preview and estimated file size.
4. Choose **Convert**.

For PNG and JPEG sources, the plugin creates a WebP beside the original, updates embedded links throughout the vault, and moves the original to the system trash. Existing WebP files are overwritten in place. Conversion is cancelled if the target path already exists.

## Installation from source

```sh
pnpm install
pnpm build
```

Copy `manifest.json`, `main.js`, and `styles.css` into `<vault>/.obsidian/plugins/convert-to-webp/`, then enable the plugin in Obsidian.
