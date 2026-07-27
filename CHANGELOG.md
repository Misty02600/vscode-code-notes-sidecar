# Changelog

## 0.7.0

- Add stable `annotation:<page-id>/<annotation-id>` links between cards in the same annotation document.
- Switch source files and pages automatically, then expand, center, and briefly emphasize the referenced card.
- Show a warning for malformed or missing annotation references.
- Separate activation, controller, annotation, preview, and Webview responsibilities into focused modules.
- Build typed Extension Host and Webview entry points while sharing the card-placement implementation.
- Add GitHub Actions validation, VSIX artifacts, tag-based private releases, and dependency updates.

## 0.6.4

- Bind expand, edit, hover, and save interactions to cards on every page at initialization.
- Continue measuring and positioning only the currently visible page.
- Observe hidden-page card resizing so cards work immediately after a page switch.

## 0.6.3

- Reveal source ranges through an already visible editor without stealing focus from the preview.
- Avoid rebuilding the preview when the active editor changes to another view of the same source document.
- Separate layout measurement from editor-driven scroll synchronization so expanding a card does not trigger duplicate jumps.

## 0.6.2

- Remove persistent pinned source decorations from card clicks.
- Reveal a card's source range with a collapsed caret instead of selecting the full range.
- Keep source highlighting strictly hover-only so leaving a card always clears it.

## 0.6.1

- Send an explicit success result for every save, including no-op saves.
- Exit edit mode and collapse the card after saving successfully.
- Re-enable the form with a retryable message if a save response takes longer than 15 seconds.
- Reduce collapsed cards to a compact title-row height.

## 0.6.0

- Collapse every annotation card to its title and line range by default.
- Expand or collapse Markdown from the card heading or disclosure button.
- Keep heading clicks synchronized with the source selection, while disclosure-only clicks leave the editor position unchanged.
- Expand a card automatically when entering inline edit mode.

## 0.5.1

- Reduce the top toolbar from 35 pixels to a breadcrumb-like 26 pixels.
- Use 22-pixel controls and tighter typography without affecting card editor buttons.

## 0.5.0

- Remove annotation tags from cards, inline editing, the public data model, and JSON Schema.
- Continue parsing older documents that still contain tags, but omit them from the preview.
- Remove legacy tags automatically when a card is next saved.

## 0.4.5

- Reduce the dedicated toolbar to a compact 35-pixel editor-title-like row.
- Keep controls on one line and truncate the file path first in narrow preview columns.

## 0.4.4

- Move file, page, lock, and reload controls into a dedicated top toolbar row.
- Scroll annotations inside a separate content viewport so controls never overlap cards.
- Update bidirectional scroll measurements to use the content viewport instead of the webview window.

## 0.4.3

- Remove leading source-line whitespace before the first card on every annotation page.
- Preserve relative source spacing between later cards after normalizing the page origin.
- Recalculate card positions synchronously when switching pages to avoid stale-layout flashes.

## 0.4.2

- Remove source marker dots and displacement connectors from the preview.
- Keep source-centered card placement, synchronized scrolling, and range highlighting without a misleading precision indicator.

## 0.4.1

- Align each source marker with the vertical center of its annotation card.
- Use the source range center consistently for marker placement and scroll mapping.
- Draw an explicit marker-to-card connector only when boundary clamping or card collisions displace a card.

## 0.4.0

- Add any number of freely named annotation pages to one source file.
- Switch pages from the preview toolbar while preserving the selected page per source file.
- Recompute source-aligned layout and scroll synchronization for the active page only.
- Keep top-level `annotations` documents working as a backward-compatible single page.
- Support direct card editing inside nested pages.

## 0.3.1

- Fix extension-host activation by bundling the ESM entry of `jsonc-parser`.
- Add a packaged-bundle smoke test so unresolved runtime imports fail before VSIX creation.

## 0.3.0

- Align annotation cards to the source editor's configured line height by default.
- Preserve exact source anchors with markers and displacement connectors when cards collide.
- Synchronize fractional visible-line centers and send preview scroll updates per animation frame.
- Extend scroll-driver locks to prevent editor and preview feedback loops.
- Add the `sourceAnnotationPreview.cardLayout` setting with `sourceAligned` and `compact` modes.

## 0.2.0

- Edit annotation titles, Markdown descriptions, and tags directly inside preview cards.
- Save edits through the VS Code document API while preserving the rest of the JSON document.
- Report invalid JSON and stale annotation identities without silently overwriting content.

## 0.1.1

- Add an editor context-menu entry for opening the annotation preview.
- Add `Ctrl+K A` (`Cmd+K A` on macOS) as the default open-preview shortcut.

## 0.1.0

- Add a source-file annotation preview that opens beside the real editor.
- Render Markdown annotations stored outside source files.
- Synchronize editor and preview scrolling with source-line anchors.
- Highlight multi-line source ranges while hovering annotation cards.
- Navigate and pin a range by selecting an annotation card.
- Watch annotation JSON files and reload external changes.
