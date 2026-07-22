# NerdPerfect Printer — Chrome extension

Produces clean, readable printouts of web articles. Extracts the article
(or the user's selection), reflows it into a print-optimized layout, and
prints that — avoiding Chrome's clipped text, ad overlays, and sticky
elements. Published free on the Chrome Web Store; no support offered.

## Hard rules

- **Manifest V3 only.** No MV2 patterns ever — no background pages;
  service worker only.

- **Plain JavaScript. No bundler, no build step, no framework.** The
  directory must load directly as an unpacked extension via
  chrome://extensions at all times.

- **Minimal permissions:** `activeTab`, `contextMenus`, `scripting`,
  `storage` — nothing more. `chrome.storage.sync` holds exactly five
  preferences: font size, serif-font checkbox, preview paper size, the
  double-sided-printer flag, and the print-comments flag.
  Nothing else is ever stored. No page content, browsing data, or history
  is stored or transmitted. No analytics, no network requests. Everything
  runs locally. Keep it Web Store review-friendly.

- **Ctrl+P cannot be intercepted.** Chrome does not let extensions
  override the print shortcut. Do not attempt it; invocation is the
  toolbar popup and the context menu only.

## Key decisions

- **Content extraction is Mozilla's Readability.js**, vendored standalone
  from mozilla/readability (see `vendor/`). Never write a custom
  extractor; never modify the vendored file beyond updating it wholesale.
  If Readability fails to parse — or "succeeds" but captures under ~20%
  of the page's text (search-results pages, where it latches onto one
  box like Google's AI Overview) — fall back to rendering `document.body`
  through the cleanup CSS. The fallback is silent: the popup status line
  shows only the page count, never how the content was obtained.

- **Listing pages never enter Readability** (it strips their images and
  title links yet can "succeed" on text volume — seen on amazon.com and
  Google). The decision is structural and made BEFORE parsing, on the
  visible page: grids of 4+ same-tag siblings each pairing an image with
  ≥30 chars of text, together holding >35% of the page's text, mean a
  listing → straight to fallback. Articles that merely contain a gallery
  fail the share test. Two guards remain after Readability: the sliver
  check above, and link density of the parse > 0.30 (listings keep most
  text inside links; real articles measure 0.03–0.15).

- **Article mode sees only rendered content**: the clone is pruned of
  computed-hidden elements (lockstep live/clone walk, like small-print
  tagging) before Readability runs — Readability's own visibility test
  reads only inline styles, so class-hidden template blobs could
  otherwise win its scoring (amazon.com printed as an empty page).

- **Fallback visibility rules** (cloneVisibleTree in extract.js): clone
  what a *sighted user sees*. `aria-hidden` is deliberately NOT honored —
  sites (Amazon) mark visible product images and prices aria-hidden.
  Hidden text is dropped only on visual evidence: display/visibility,
  sub-2px boxes, boxes left of/above the document origin, and zero-area
  clip/clip-path. One trick defeats all geometry tests — duplicates
  positioned exactly ON TOP of the visible copy (Amazon's
  `.a-offscreen` / `.a-truncate-full` / `.a-icon-alt`) — those are
  stripped by class name in SP_FALLBACK_CHROME_SELECTORS (shared.js),
  alongside site furniture (nav/header/footer landmarks, Amazon chrome).

- **Fallback retiles results grids as cards**: 4+ same-tag siblings each
  pairing an image with ≥30 chars of text = a listing grid; each tile
  becomes a thumbnail-left ruled row (`[data-sp-card]`, styled in
  print.css, unbreakable across pages — mirrored in popup.js's
  pagination atoms). Beats both Chrome and Printdeck on Amazon.

- **Printing happens in the article's own tab** (no render tab): the
  cleaned printout is injected hidden into the page, revealed only under
  `@media print`, `window.print()` runs, and everything is removed on
  afterprint (see spPrintInPage in shared.js — it must stay fully
  self-contained, since executeScript serializes it). This keeps Chrome's
  optional print header/footer showing the article's real URL and title;
  a separate extension render tab would print `chrome-extension://…`
  there, which is unfixable — Chrome always prints the printing
  document's own location.

- **Selection vs. article — different content rules:**
  - *Selection mode* (text is selected on the page): print exactly what
    was selected, verbatim — including comments if the user selected
    comments — preserving inline formatting and images, rendered through
    our clean print template. Page title as header. No stripping.
  - *Full-article mode*: comments never appear in the article body.
    Readability handles most of this, but known comment containers (e.g.
    `#comments`, `.comments-section`, `[class*="comment"]`, Substack's
    container) are stripped as a safety net. This stripping must NOT run
    in selection mode. The "Print comments" checkbox (default OFF)
    appends the page's loaded comment threads AFTER the article, under a
    "Comments" heading — it never un-strips the article body itself, and
    it can only include comments already loaded in the page's DOM.

## UX contract — 2 clicks, never more

Click toolbar icon → popup opens with a live paginated preview, font-size
dropdown (SP_FONT_SIZES in shared.js, default 11pt), force-font checkbox
labeled from SP_SERIF_STACK's first entry (e.g. "Force Georgia"; default
OFF = page's own body font), paper-size dropdown (SP_PAPERS —
desktop Chrome cannot query the real printer's sizes; chrome.printing is
ChromeOS-only), and two buttons: **Print first sheet**
(truncated to fit ONE physical sheet — 2 pages when the double-sided
setting is on, 1 page when off — cut wherever it fits, mid-paragraph is
fine, with "…" + source URL appended) and **Print all**. Either button leads straight
to the standard system print dialog. So: icon → print button → system
dialog. Nothing else may be inserted into this flow.

## Testing workflow

- Load unpacked at chrome://extensions (Developer mode on).
- After any code change, **reload the extension** on chrome://extensions
  (popup/CSS changes show on next popup open; worker and content-script
  changes need the reload).
- Three separate consoles, easy to confuse:
  - **Service worker console** — "Inspect views: service worker" link on
    the extension's card.
  - **Popup console** — right-click inside the open popup → Inspect.
  - **Page console** — normal DevTools on the tab (content-script logs
    appear here).
