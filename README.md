# PhotoRoom Background Remover

Firefox extension for one-click background removal using PhotoRoom. Features floating buttons on images, high-resolution support for Google Images, and automatic download with silent tab close.

## Features

- **Floating "Remove BG" buttons** on all images (>100px)
- **High-resolution image support** from Google Images
- **Automatic upload** to PhotoRoom
- **Auto-download** result image
- **Silent tab close** after download (0.5s)
- **Right-click context menu** option
- **Toolbar popup** for easy access

## Installation

### Firefox (Developer Mode)
1. Open Firefox and go to `about:debugging`
2. Click "This Firefox" → "Load Temporary Add-on"
3. Select `manifest.json` from the extension folder

### Firefox (Permanent)
1. Zip all extension files
2. Rename `.zip` to `.xpi`
3. Drag and drop into Firefox

## Usage

1. **Browse any website** with images
2. **Hover over an image** to see the "🖼️ Remove BG" button
3. **Click the button** to open PhotoRoom and auto-process
4. **Image downloads automatically** and tab closes silently

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration |
| `background.js` | Background script for downloads |
| `content.js` | PhotoRoom page automation |
| `image-buttons.js` | Floating buttons on images |
| `popup.html/js` | Toolbar popup UI |

## Permissions

- `contextMenus` - Right-click menu
- `activeTab` - Current tab access
- `<all_urls>` - All websites
- `downloads` - Save images
- `webRequest` - Intercept requests

## License

MIT
