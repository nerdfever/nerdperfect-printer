# NerdPerfect Printer

Clean, readable printouts of web articles — in two clicks.

Chrome's built-in print frequently clips text at the page edges and lets
ads, overlays, and sticky elements render on top of article text.
NerdPerfect Printer extracts the article content (using Mozilla's Readability, the
same engine as Firefox Reader View), reflows it into a clean
print-optimized layout, and prints that instead.

Published by [nerdfever.com](https://nerdfever.com).
Original author: Claude Fable 5, 2026-07-07.

## How to install (load unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (toggle, top right).
3. Click **Load unpacked** and select this folder.
4. Optional: click the puzzle-piece icon in the toolbar and pin NerdPerfect Printer.

## How to use

1. Click the NerdPerfect Printer toolbar icon. A popup opens with a preview of the
   cleaned article exactly as it will print, with page boundaries marked.
   If you have text selected on the page, the preview shows your selection
   instead — verbatim, including anything you selected.
2. Click **Print all** (the whole article / selection) or **Print first sheet**
   (truncated to fit one physical sheet — two pages if "Double-sided
   printer" is checked, one page if not — ending with "…" and the source
   URL).
3. Confirm the standard system print dialog. Printer choice, Save-as-PDF,
   duplex, and actual paper size all live there, as usual.

Want a bigger preview? Click the ⤢ button to open the same controls and
preview in a normal window you can resize freely (Chrome limits toolbar
popups to 800x600).

That's it: icon → print button → system dialog.

You can also right-click a page and choose **Print page with NerdPerfect
Printer** (or select text and choose **Print selection with NerdPerfect
Printer**) to print immediately with your saved settings, skipping the
popup.

Note: extensions cannot intercept Ctrl+P — that shortcut always opens
Chrome's own print flow. Use the toolbar icon or context menu.

## Settings (in the popup)

- **Font size** — 6–36 pt, default 11. The preview reflows live.
- **Force Georgia font** — off by default, which keeps the web page's own
  body font; on forces everything into a classic serif (Georgia).
- **Print preview size** — Letter (8.5x11"), Legal (8.5x14"), Tabloid
  (11x17"), Super B (13x19"), A4, A5, or B5; used for the preview
  pagination and the one-sheet fit calculation. The actual paper is
  whatever the print dialog says.

- **Double-sided printer** — on by default. Tells "Print first sheet"
  whether one sheet of paper holds two pages (double-sided) or just one
  (single-sided).
- **Print comments** — off by default. When on, the page's comment
  threads are appended after the article under a "Comments" heading.
  Only comments already loaded on the page can be printed — on sites
  that load more comments as you scroll, scroll through them first.

All five are remembered between uses (synced via your Chrome profile).

## Known limitations

- "Site font" means the page's computed font-family *stack*. Web fonts the
  site downloads aren't available to the print layout, so the printout
  falls back to the nearest font installed on your machine.
- The one-sheet fit assumes the paper size chosen in the popup; if the
  printer is loaded with different paper, the cut point will be off.
- Pages that Chrome closes to extensions (chrome:// pages, the Web Store,
  some PDFs) cannot be printed with NerdPerfect Printer.

## Privacy

All processing happens locally in your browser. The only data NerdPerfect Printer
ever stores is your five preferences (font size, serif toggle, paper
size, double-sided flag, print-comments flag). Nothing about the pages you read — no content, no URLs, no history —
is stored or transmitted anywhere. No analytics, no network requests, no
account.

## Credits and license

- Article extraction: [Readability.js](https://github.com/mozilla/readability)
  by Mozilla and Arc90, vendored unmodified in `vendor/` (version 0.6.0,
  Apache License 2.0 — see `vendor/LICENSE.md`).
- Everything else: original author Claude Fable 5, 2026-07-07.

NerdPerfect Printer is provided as-is, free of charge, with **no support offered**.
