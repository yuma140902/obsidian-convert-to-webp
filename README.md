# Obsidian Plugin: Convert to WebP

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

## Installation with BRAT

Install this plugin using [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## Related plugins

- [obsidian-image-converter](https://github.com/xryul/obsidian-image-converter): This plugin was inspired by obsidian-image-converter and developed as a simpler alternative to it.
