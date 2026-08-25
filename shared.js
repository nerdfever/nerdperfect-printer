// NerdPerfect Printer — shared.js
// Original author: Claude Fable 5, 2026-07-07
//
// Helpers shared by the popup and the service worker. Loaded as a plain
// <script> in popup.html and via importScripts() in background.js — so
// everything here is plain globals, no modules, and nothing runs at load
// time. (Also injected into pages' isolated worlds ahead of extract.js,
// which is why top-level declarations use redeclaration-safe `var`.)

"use strict";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Paper sizes the preview / one-sheet math can assume (inches). Desktop
// Chrome gives extensions no way to query the real printer's sizes (the
// chrome.printing API is ChromeOS-only), so we offer the common ones;
// the actual paper is whatever the system print dialog says.
var SP_PAPERS = {
  letter:  { widthIn: 8.5,  heightIn: 11,    label: 'Letter (8.5x11")' },
  legal:   { widthIn: 8.5,  heightIn: 14,    label: 'Legal (8.5x14")' },
  tabloid: { widthIn: 11,   heightIn: 17,    label: 'Tabloid (11x17")' },
  superb:  { widthIn: 13,   heightIn: 19,    label: 'Super B (13x19")' },
  a4:      { widthIn: 8.27, heightIn: 11.69, label: "A4" },
  a5:      { widthIn: 5.83, heightIn: 8.27,  label: "A5" },
  b5:      { widthIn: 6.93, heightIn: 9.84,  label: "B5 (ISO)" },
};

// Font sizes offered in the popup dropdown (pt): fine half-point steps
// through the body-text range, bigger jumps above.
var SP_FONT_SIZES = [6, 7, 8, 9, 9.5, 10, 10.5, 11, 11.5, 12, 13, 14, 16, 18, 20, 24, 28, 36];

// Page margin baked into print.css's @page rule (inches). Generous enough
// that common printers never clip. Keep this in sync with print.css.
var SP_MARGIN_IN = 0.75;

// CSS pixels per inch (fixed by the CSS spec).
var SP_DPI = 96;

// The serif stack used when "Use clean serif font" is checked.
var SP_SERIF_STACK = 'Georgia, "Times New Roman", Times, serif';

// Fallback font when the page's own font couldn't be captured.
var SP_FALLBACK_STACK = "system-ui, sans-serif";

// Known comment containers, stripped as a safety net in full-article mode
// (Readability drops most comments already). NEVER applied in selection mode.
var SP_COMMENT_SELECTORS = [
  "#comments",
  "#respond",
  "#disqus_thread",
  ".comments",
  ".comments-section",   // Substack
  ".comments-page",      // Substack
  ".comment-list",
  ".comments-area",
  '[class*="comment"]',
  '[id*="comment"]',
].join(", ");

// Known ad-network containers, stripped before Readability runs (and from
// fallback renderings). Beyond wasting ink, a big injected ad unit inside
// the article body drags down its Readability score enough to change which
// container wins — pulling in header chrome and pruning real paragraphs
// (seen on xda-developers). Selectors must be specific to ad tech: bare
// substring matches on "ad" would hit words like "gradient" or "download".
var SP_AD_SELECTORS = [
  "ins.adsbygoogle",          // Google AdSense
  '[id^="google_ads_"]',      // Google ad iframes/slots
  '[id^="div-gpt-ad"]',       // Google Publisher Tag slots
  '[data-google-query-id]',   // anything GPT has already filled
  '[class*="adsninja"]',      // AdsNinja (xda-developers and friends)
  '[id*="adsninja"]',
  ".ad-zone",
  ".ad-container",
  ".ad-wrapper",
  ".ad-slot",
  "[data-ad-unit]",
  "shreddit-comment-tree-ad",  // Reddit: ads interleaved in comment threads
  "shreddit-dynamic-ad-link",  // Reddit: promoted links in post bodies/rails
  "shreddit-ad-post",          // Reddit: promoted posts in feeds
  "[ads-correlation-id]",           // Reddit: any element carrying ad-tracking
  "[ad-transparency-encoded-data]", //   attributes IS an ad, whatever its tag
].join(", ");

// Page chrome stripped ONLY in fallback (whole-page) mode. Fallback pages
// are portals and results pages, not articles — landmark furniture
// (navigation, headers, footers, search boxes, facet sidebars, consent
// dialogs) only wastes paper there. Never applied in article mode (which
// Readability already prunes) or selection mode (verbatim by contract).
var SP_FALLBACK_CHROME_SELECTORS = [
  "nav",
  "header",
  "footer",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="search"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  "#navbar",                  // Amazon top nav (also common Bootstrap-era nav id)
  "#nav-belt",                // Amazon search-bar row
  "#s-refinements",           // Amazon facet/filter sidebar
  "#navFooter",               // Amazon site footer
  "#rhf",                     // Amazon "related to items you've viewed"
  "#sp-cc",                   // Amazon cookie-consent banner
  ".s-pagination-strip",      // Amazon results pagination
  ".s-pagination-container",
  ".a-button",                // Amazon buttons ("Add to basket") — styled
                              //   spans, so the print CSS button rule
                              //   can't catch them
  ".a-offscreen",             // Amazon screen-reader / truncation text
  ".a-truncate-full",         //   twins: absolutely positioned exactly ON
  ".a-icon-alt",              //   TOP of the visible copy, so no geometry
                              //   test can distinguish them — reflowed,
                              //   they print as duplicated text
  ".a-popover-preload",       // Amazon preloaded popover bodies ("You're
  '[id^="a-popover"]',        //   seeing this ad based on…")
  "#left-sidebar-container",  // Reddit layout rails: nav column and the
  "#right-sidebar-container", //   related-posts/sign-up column
].join(", ");

// Recommendation rails on shop pages ("More to love", "Customers also
// bought") — cross-sell grids of products the user never asked about,
// often bigger than the real content (19 tiles vs 10 orders on an
// aliexpress order list). Class/id substring match, same approach as
// the comment selectors. Fallback mode only.
var SP_RECOMMEND_SELECTORS = [
  '[class*="recommend"]',
  '[id*="recommend"]',
  "reddit-pdp-right-rail-post",   // Reddit "Related posts" tiles
].join(", ");

// Interactive site widgets that mean nothing on paper: vote/share/award
// rows, overflow menus, sort dropdowns, loading spinners. Custom-element
// tag names (Reddit's shreddit UI so far — the list grows as sites are
// met); the print CSS already hides real <button> elements, but these
// wrappers aren't buttons. Stripped from fallback pages and from
// captured comment threads. NEVER applied in selection mode.
var SP_SITE_WIDGET_SELECTORS = [
  "shreddit-comment-action-row",
  "shreddit-comment-share-button",
  "shreddit-overflow-menu",
  "shreddit-post-overflow-menu",
  "shreddit-sort-dropdown",
  "award-button",
  "rpl-dropdown",
  "faceplate-loader",
  "faceplate-progress",
].join(", ");

// Reddit post media: only images that RENDERED at least this big
// (area, px²) count as post content — smaller ones are icons/badges.
var SP_POST_MEDIA_MIN_AREA_PX = 10000;

// An image pushed whole to the next page (break-inside: avoid) leaves a
// gap behind. If shrinking it — down to this fraction of its laid-out
// size — lets it stay on the page where its text wants it, shrink it.
// Below the floor, pushing reads better than a postage stamp.
var SP_IMG_FIT_MIN_SCALE = 0.6;
var SP_IMG_FIT_SLACK_PX = 8;      // breathing room under the exact gap
var SP_IMG_FIT_MIN_HEIGHT_PX = 120;  // smaller images never win a page push

// Fallback/comments: interactive form machinery means nothing on paper.
// print.css hides the controls themselves, but their husks remain —
// empty list rows print stray bullet markers, fieldset borders box
// nothing (an order confirmation's "create an account" box). A form or
// fieldset with less text than this is pure UI and drops whole; a
// bigger one (some sites wrap entire pages in a form) keeps everything
// but the controls.
var SP_FORM_JUNK_MAX_CHARS = 400;
var SP_FORM_CONTROL_SELECTORS = [
  "input",
  "textarea",
  "select",
  "button",
  "datalist",
  "meter",
  "progress",
].join(", ");

// Preview stand-ins: an image whose natural width comes in below this
// fraction of its stamped (live-rendered) width did not really load —
// guarded CDNs return tiny error images with HTTP 500 (LA Times), which
// count as a "successful" load. The real page prints the real picture.
var SP_GHOST_MIN_NATURAL_RATIO = 0.3;

// Threaded comments: replies are indented on screen; reproduce that on
// paper from each comment's measured left offset (stamped at clone
// time), scaled down to save column width and capped per nesting step.
var SP_COMMENT_INDENT_SCALE = 0.5;
var SP_COMMENT_INDENT_STEP_MAX_PX = 48;

// Fallback/comments: an image RENDERED at or below this size (both
// dimensions) is an icon or avatar. It gets tagged data-sp-icon so the
// print CSS can cap it — with the site's stylesheets gone it would
// otherwise print at its intrinsic file size (a 32px avatar can be a
// 256px file: 2.7 inches of face per comment).
var SP_ICON_MAX_PX = 48;

// Fallback mode: an element painting a CSS background-image at least this
// big (rendered, both dimensions) is treated as a real content image —
// shop sites often render product photos as background divs, not <img>
// (aliexpress order lists), and those would otherwise clone as empty
// boxes and never print. Kept well above icon/sprite size.
var SP_BG_IMAGE_MIN_PX = 48;

// Fallback listing pages: pruning the furniture that flanks the results
// column (see pruneListingFurniture in extract.js).
var SP_SPINE_DOMINANT_SHARE = 0.75;  // child holding this share of a node's
                                     //   text is "the content spine"
var SP_SPINE_FLANK_MAX_CHARS = 400;  // a card-less flank with more text than
                                     //   this is treated as real prose, and
                                     //   stops the pruning entirely

// Settings defaults — these five preferences are ALL we ever store.
var SP_DEFAULT_SETTINGS = {
  fontSize: 11,       // pt, one of SP_FONT_SIZES
  serif: false,       // false = use the page's own body font
  paper: "letter",    // a key of SP_PAPERS
  duplex: true,       // true = one sheet holds 2 pages; false = 1 page
  comments: false,    // true = append the page's comment threads
};


// ---------------------------------------------------------------------------
// Settings (chrome.storage.sync)
// ---------------------------------------------------------------------------

// Load the saved preferences, filling in defaults for anything missing.
async function spLoadSettings() {
  const stored = await chrome.storage.sync.get(SP_DEFAULT_SETTINGS);

  // Snap the stored font size to the nearest value the dropdown offers,
  // in case an out-of-range value was ever synced.
  const wanted = Number(stored.fontSize) || 11;
  stored.fontSize = SP_FONT_SIZES.reduce(
    (best, size) => (Math.abs(size - wanted) < Math.abs(best - wanted) ? size : best),
    SP_FONT_SIZES[0]
  );

  // Fall back to Letter if the paper key is unrecognized.
  if (!SP_PAPERS[stored.paper]) stored.paper = "letter";

  // Coerce the flags to plain booleans.
  stored.duplex = Boolean(stored.duplex);
  stored.comments = Boolean(stored.comments);

  return stored;
}

// Persist the preferences (the only data this extension ever stores).
async function spSaveSettings(settings) {
  await chrome.storage.sync.set({
    fontSize: settings.fontSize,
    serif: settings.serif,
    paper: settings.paper,
    duplex: settings.duplex,
    comments: settings.comments,
  });
}


// ---------------------------------------------------------------------------
// Paper geometry
// ---------------------------------------------------------------------------

// Page dimensions in CSS pixels for a given paper setting: the full sheet,
// the printable area inside the @page margins, and the margin itself.
function spPaperMetrics(paper) {
  const p = SP_PAPERS[paper] || SP_PAPERS.letter;

  return {
    paperWidthPx:    Math.round(p.widthIn  * SP_DPI),
    paperHeightPx:   Math.round(p.heightIn * SP_DPI),
    marginPx:        Math.round(SP_MARGIN_IN * SP_DPI),
    contentWidthPx:  Math.round((p.widthIn  - 2 * SP_MARGIN_IN) * SP_DPI),
    contentHeightPx: Math.round((p.heightIn - 2 * SP_MARGIN_IN) * SP_DPI),
  };
}


// ---------------------------------------------------------------------------
// Document assembly
// ---------------------------------------------------------------------------

// Escape text for safe insertion into HTML.
function spEscapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Today's date as YYYY-MM-DD (local time).
function spTodayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Build the full body HTML of a printout: title header, optional byline,
// the content, and the source-URL/date footer. Used identically by the
// popup preview and the print tab so the preview matches the printout.
function spBuildBodyHtml(meta, contentHtml) {
  const parts = [];

  // Title header (the page/article title).
  parts.push(`<h1 class="sp-title">${spEscapeHtml(meta.title || "")}</h1>`);

  // Byline, when Readability found one.
  if (meta.byline) {
    parts.push(`<div class="sp-byline">${spEscapeHtml(meta.byline)}</div>`);
  }

  // The article / selection content itself. Fallback mode gets an extra
  // class so print.css can apply stricter whole-page rules.
  const contentClass =
    meta.mode === "fallback" ? "sp-content sp-mode-fallback" : "sp-content";
  parts.push(`<div class="${contentClass}">${contentHtml}</div>`);

  // Footer: source URL and retrieval date, small text at the end.
  parts.push(
    `<div class="sp-footer">Source: ${spEscapeHtml(meta.url || "")}` +
    ` &middot; Printed ${spTodayISO()}</div>`
  );

  return parts.join("\n");
}

// The font-family to render with: our serif when the checkbox is on,
// otherwise the font stack captured from the page (with a fallback).
function spResolveFontFamily(settings, siteFont) {
  return settings.serif ? SP_SERIF_STACK : (siteFont || SP_FALLBACK_STACK);
}

// Push the user's choices into the CSS custom properties print.css reads.
// Works on any document rendered with print.css (preview iframe, print tab).
function spApplyPrintVars(doc, settings, siteFont) {
  const metrics = spPaperMetrics(settings.paper);
  const root = doc.documentElement;

  root.style.setProperty("--sp-font-size", settings.fontSize + "pt");
  root.style.setProperty("--sp-font-family", spResolveFontFamily(settings, siteFont));
  root.style.setProperty("--sp-content-width", metrics.contentWidthPx + "px");
  root.style.setProperty("--sp-content-height", metrics.contentHeightPx + "px");
}

// Wait until every image in the document has loaded (or errored), with a
// hard timeout so a dead image URL can never stall printing or measuring.
function spWaitForImages(doc, timeoutMs) {
  const pending = Array.from(doc.images).filter((img) => !img.complete);
  if (!pending.length) return Promise.resolve();

  const allDone = Promise.allSettled(
    pending.map(
      (img) =>
        new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        })
    )
  );

  const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));

  return Promise.race([allDone, timeout]);
}


// ---------------------------------------------------------------------------
// Pagination model (popup preview and one-sheet fitting both use this;
// it mirrors how the print engine breaks pages)
// ---------------------------------------------------------------------------

// The vertical extent of every unbreakable atom in `flow`: each text
// line box, plus images/figures/cards (break-inside: avoid keeps those
// whole). Tops/bottoms are relative to the flow's top edge.
function spCollectAtoms(doc, flow) {
  const flowTop = flow.getBoundingClientRect().top;
  const atoms = [];

  const walker = doc.createTreeWalker(flow, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const tn = walker.currentNode;
    if (!tn.data.trim()) continue;

    const range = doc.createRange();
    range.selectNodeContents(tn);
    for (const r of range.getClientRects()) {
      if (r.height > 0) atoms.push({ top: r.top - flowTop, bottom: r.bottom - flowTop });
    }
  }

  for (const el of flow.querySelectorAll("img, svg, canvas, figure, [data-sp-card]")) {
    const r = el.getBoundingClientRect();
    if (r.height > 0) atoms.push({ top: r.top - flowTop, bottom: r.bottom - flowTop });
  }

  atoms.sort((a, b) => a.top - b.top);
  return atoms;
}

// Y positions (relative to the flow's top) where a page may break without
// slicing through a line of text, an image, or a figure — the same rule
// the print engine follows when it pushes a straddling line to the next
// page.
function spComputePageBreaks(doc, flow, pageH) {
  const flowHeight = Math.max(flow.scrollHeight, 1);
  const atoms = spCollectAtoms(doc, flow);

  // Walk down a page at a time; any atom straddling the tentative break
  // pulls the break up to its own top edge (i.e. the atom moves to the
  // next page). Repeat until nothing straddles.
  const breaks = [0];
  let start = 0;
  let guard = 5000;

  while (start + pageH < flowHeight && guard-- > 0) {
    let breakY = start + pageH;

    let changed = true;
    while (changed && guard-- > 0) {
      changed = false;
      for (const a of atoms) {
        if (a.top >= breakY) break;   // sorted by top — no straddlers past here
        if (a.bottom > breakY) {
          breakY = a.top;
          changed = true;
          break;
        }
      }
    }

    // Degenerate case (an atom taller than the whole page): hard-slice.
    if (breakY <= start + 40) breakY = start + pageH;

    breaks.push(breakY);
    start = breakY;
  }

  return { breaks, flowHeight };
}

// Give a grey, correctly-sized stand-in to every image that did not
// genuinely load in this document: still pending after the image wait,
// errored, or "loaded" as a tiny CDN error stub far below its stamped
// live size (SP_GHOST_MIN_NATURAL_RATIO). The stand-in keeps pagination
// honest; its styles are stripped again before printing, where the real
// page loads the real picture. `maxW` is the print column width.
function spGhostUnloadedImages(doc, maxW) {
  for (const img of doc.images) {
    const w = Number(img.getAttribute("data-sp-w")) || 0;
    const h = Number(img.getAttribute("data-sp-h")) || 0;
    if (!w || !h) continue;

    const loadedRight =
      img.complete && img.naturalWidth >= w * SP_GHOST_MIN_NATURAL_RATIO;
    if (loadedRight) continue;

    const scale = Math.min(1, maxW / w);
    img.style.setProperty("width", Math.round(w * scale) + "px", "important");
    img.style.setProperty("height", Math.round(h * scale) + "px", "important");
    img.style.setProperty("background", "#e8e8e8", "important");
    img.setAttribute("data-sp-ghost", "1");
  }
}

// An image that ALMOST fit gets pushed whole to the next page, leaving a
// gap behind (a tall lead photo after two paragraphs of a fresh article,
// say). Find each pushed image; when shrinking it into the gap keeps it
// on the page its text wants — never below SP_IMG_FIT_MIN_SCALE of its
// laid-out size — cap its height inline (!important, to outrank the
// print stylesheet) and re-measure. The caps ride with the content into
// the actual print job, so paper matches the preview.
async function spShrinkImagesToFit(doc, flow, pageH) {
  let guard = 10;

  while (guard-- > 0) {
    const { breaks } = spComputePageBreaks(doc, flow, pageH);
    const atoms = spCollectAtoms(doc, flow);
    const flowTop = flow.getBoundingClientRect().top;

    let changed = false;

    for (const img of flow.querySelectorAll("img")) {
      if (img.hasAttribute("data-sp-fitted")) continue;

      // What the print engine pushes is the whole figure when there is one.
      const unit = img.closest("figure") || img;
      const ur = unit.getBoundingClientRect();
      const unitTop = ur.top - flowTop;
      if (ur.height < SP_IMG_FIT_MIN_HEIGHT_PX) continue;

      // "Pushed" = the unit sits exactly at the start of a page (not page 1).
      const bi = breaks.findIndex((b, i) => i > 0 && Math.abs(b - unitTop) < 2);
      if (bi < 0) continue;

      // The gap it left: from the bottom of the last atom that stayed on
      // the previous page to that page's end.
      const prevStart = breaks[bi - 1];
      let lastBottom = prevStart;
      for (const a of atoms) {
        if (a.bottom <= unitTop + 1 && a.bottom > lastBottom) lastBottom = a.bottom;
      }
      const gap = prevStart + pageH - lastBottom - SP_IMG_FIT_SLACK_PX;

      // Only the image shrinks — captions keep their height, and the
      // unit's own margins (outside its rect) still take up page space —
      // so the image's budget is the gap minus all that overhead.
      const ir = img.getBoundingClientRect();
      const ucs = doc.defaultView.getComputedStyle(unit);
      const overhead =
        (ur.height - ir.height) +
        (parseFloat(ucs.marginTop) || 0) +
        (parseFloat(ucs.marginBottom) || 0);
      const targetH = gap - overhead;

      if (targetH >= ir.height) continue;                        // would fit anyway
      if (targetH < ir.height * SP_IMG_FIT_MIN_SCALE) continue;  // too much shrink

      img.style.setProperty("max-height", Math.floor(targetH) + "px", "important");

      // A stand-in has a fixed width; shrink it in proportion so the
      // ghost box keeps the picture's shape.
      if (img.hasAttribute("data-sp-ghost")) {
        const ghostW = parseFloat(img.style.width) || 0;
        if (ghostW) {
          img.style.setProperty(
            "width",
            Math.round((ghostW * targetH) / ir.height) + "px",
            "important"
          );
        }
      }

      img.setAttribute("data-sp-fitted", "1");
      changed = true;
      break;   // reflow, then look again with fresh geometry
    }

    if (!changed) return;

    // Let the layout settle before the next measurement pass.
    await new Promise((resolve) => doc.defaultView.requestAnimationFrame(() => resolve()));
  }
}

// The content HTML to render: the article/selection itself, plus the
// page's comment threads when the "Print comments" preference is on.
function spComposeContentHtml(payload, settings) {
  let html = payload.html;

  // Comments go after the article, under their own heading.
  if (settings.comments && payload.commentsHtml) {
    html += '<h2 class="sp-comments-title">Comments</h2>' + payload.commentsHtml;
  }

  return html;
}

// ---------------------------------------------------------------------------
// In-page printing
// ---------------------------------------------------------------------------

// Print a payload in its own tab via spPrintInPage. Prepares everything
// that needs extension-context access — the print stylesheet text and the
// assembled body HTML. `contentHtml` overrides the composed content (the
// popup's one-sheet truncation); pass null for the standard composition.
// Callable from the popup and the service worker.
async function spPrintInTab(tabId, payload, settings, contentHtml) {
  // The print stylesheet, as text the injected printer can carry along.
  const cssText = await (await fetch(chrome.runtime.getURL("print.css"))).text();

  // The chosen paper's geometry, for the layout knobs below.
  const metrics = spPaperMetrics(settings.paper);

  // Everything the in-page printer needs, in one serializable job.
  const job = {
    bodyHtml: spBuildBodyHtml(
      payload,
      contentHtml != null ? contentHtml : spComposeContentHtml(payload, settings)
    ),
    cssText,
    fontFamily: spResolveFontFamily(settings, payload.siteFont),
    fontSizePt: settings.fontSize,
    contentWidthPx: metrics.contentWidthPx,
    contentHeightPx: metrics.contentHeightPx,
  };

  // Inject the printer into the page.
  await chrome.scripting.executeScript({
    target: { tabId },
    func: spPrintInPage,
    args: [job],
  });
}

// Runs INSIDE the target page (injected via executeScript, so it must be
// fully self-contained — no references to anything in this file). Renders
// the prepared printout in a hidden container that becomes the only
// visible thing under @media print, opens the print dialog, and cleans up
// afterwards. Printing in the page's own tab keeps Chrome's optional
// print header/footer showing the article's real title and URL — a
// separate render tab would print chrome-extension://… there.
async function spPrintInPage(job) {
  const doc = document;
  const ROOT_ID = "nerdperfect-print-root";

  // A previous run may have been interrupted — clear its leftovers.
  const stale = doc.getElementById(ROOT_ID);
  if (stale) stale.remove();

  // The printout, invisible on screen.
  const root = doc.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = job.bodyHtml;
  doc.body.appendChild(root);

  // Our font/paper knobs, as the custom properties the print CSS reads.
  // Set on <html> so they inherit down to the body rules. Harmless on
  // screen (nothing else reads --sp-* properties); removed on cleanup.
  const rootStyle = doc.documentElement.style;
  rootStyle.setProperty("--sp-font-size", job.fontSizePt + "pt");
  rootStyle.setProperty("--sp-font-family", job.fontFamily);
  rootStyle.setProperty("--sp-content-width", job.contentWidthPx + "px");
  rootStyle.setProperty("--sp-content-height", job.contentHeightPx + "px");

  // Print-only styles: hide the page, show only the printout, then the
  // whole print stylesheet — all nested inside @media print so the
  // page's screen rendering is never touched.
  const cssText =
    "#" + ROOT_ID + " { display: none; }\n" +
    "@media print {\n" +
    "  html > :not(body):not(head) { display: none !important; }\n" +
    "  body > :not(#" + ROOT_ID + ") { display: none !important; }\n" +
    // The printout gets its own topmost stacking layer with an opaque
    // background: page overlays that lose their styling when we disable
    // the site's stylesheets can otherwise print as white slabs painted
    // over the content (seen on Google results pages).
    "  #" + ROOT_ID + " {\n" +
    "    display: block !important;\n" +
    "    position: relative !important;\n" +
    "    z-index: 2147483647 !important;\n" +
    "    background: #fff !important;\n" +
    "  }\n" +
    job.cssText + "\n" +
    "}\n";

  // Prefer a constructed stylesheet (immune to the page's CSP); fall back
  // to a <style> element where unsupported.
  const priorAdopted = Array.from(doc.adoptedStyleSheets);
  let sheet = null;
  let styleEl = null;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  } catch (e) {
    styleEl = doc.createElement("style");
    styleEl.textContent = cssText;
    doc.documentElement.appendChild(styleEl);
  }

  // The site's own stylesheets, disabled while the dialog is open (see
  // below) and restored afterwards.
  const disabledSheets = [];

  // Undo everything once the dialog closes (printed or cancelled alike).
  window.addEventListener(
    "afterprint",
    () => {
      root.remove();
      doc.adoptedStyleSheets = priorAdopted;
      if (styleEl) styleEl.remove();
      for (const ss of disabledSheets) ss.disabled = false;
      rootStyle.removeProperty("--sp-font-size");
      rootStyle.removeProperty("--sp-font-family");
      rootStyle.removeProperty("--sp-content-width");
      rootStyle.removeProperty("--sp-content-height");
    },
    { once: true }
  );

  // Give pending images a moment — they usually come straight from this
  // page's cache, so this rarely waits at all.
  const pending = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
  if (pending.length) {
    await Promise.race([
      Promise.allSettled(
        pending.map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener("load", resolve, { once: true });
              img.addEventListener("error", resolve, { once: true });
            })
        )
      ),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
  }

  // The popup's preview and one-sheet fit are measured WITHOUT the site's
  // stylesheets, but here they'd still style the cloned content (its
  // classes resolve against them) and paginate differently. Disable them
  // while the dialog is open so what prints is exactly what was measured.
  // The page behind the dialog looks unstyled for the duration; afterprint
  // restores it.
  for (const ss of Array.from(doc.styleSheets)) {
    try {
      if (!ss.disabled) {
        ss.disabled = true;
        disabledSheets.push(ss);
      }
    } catch (e) {
      // Cross-origin stylesheet objects can throw on access — skip them.
    }
  }
  if (sheet) doc.adoptedStyleSheets = [sheet];

  // The system print dialog.
  window.print();
}


// ---------------------------------------------------------------------------
// Extraction (runs the content scripts in the target tab)
// ---------------------------------------------------------------------------

// Extract content from the tab. `mode` is "auto" (selection if one exists,
// else article), "article" (force full article), or "selection".
// Returns the payload object produced by extract.js.
async function spExtractFromTab(tabId, mode) {
  // Hand the requested mode to the isolated world where extract.js runs.
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (m) => { self.__smartPrintMode = m; },
    args: [mode],
  });

  // Define the Readability class and our shared constants in that world.
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["shared.js", "vendor/readability.js"],
  });

  // Run the extractor; its completion value is the payload.
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: ["extract.js"],
  });

  return results && results[0] ? results[0].result : null;
}
