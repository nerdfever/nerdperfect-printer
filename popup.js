// NerdPerfect Printer — popup.js
// Original author: Claude Fable 5, 2026-07-07
//
// Drives the popup: extracts content from the active tab, renders a live
// scaled preview through print.css, overlays page boundaries and the
// one-sheet cut line, and dispatches print jobs to the service worker.

"use strict";


// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let payload = null;      // extraction result from extract.js
let settings = null;     // { fontSize, serif, paper, duplex, comments }
let activeTabId = null;  // the tab we extracted from (and will print in)

// DOM handles.
const el = {
  fontSize: document.getElementById("fontSize"),
  serif: document.getElementById("serif"),
  paper: document.getElementById("paper"),
  duplex: document.getElementById("duplex"),
  comments: document.getElementById("comments"),
  expand: document.getElementById("expand"),
  printOne: document.getElementById("printOne"),
  printAll: document.getElementById("printAll"),
  status: document.getElementById("status"),
  previewArea: document.getElementById("previewArea"),
  sheetWrap: document.getElementById("sheetWrap"),
  preview: document.getElementById("preview"),
  measure: document.getElementById("measure"),
};


// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

init();

async function init() {
  // Populate the dropdowns from the lists in shared.js.
  for (const size of SP_FONT_SIZES) {
    el.fontSize.add(new Option(String(size)));
  }
  for (const [key, paper] of Object.entries(SP_PAPERS)) {
    el.paper.add(new Option(paper.label, key));
  }

  // Brand line carries the version (from the manifest, the one source
  // of truth), e.g. "NerdPerfect Printer v1.10".
  document.getElementById("brandName").textContent =
    "NerdPerfect Printer v" + chrome.runtime.getManifest().version_name;

  // Label the force-font checkbox with the font it actually forces
  // (the first entry of the serif stack in shared.js).
  document.getElementById("serifLabel").textContent =
    "Force " + SP_SERIF_STACK.split(",")[0].trim().replace(/["']/g, "") + " font";

  // When opened via the ⤢ button, the target tab id rides in the URL
  // (the "active tab" would otherwise be this window itself). Switch to
  // fluid sizing and hide the now-pointless expand button.
  const forcedTab = Number(new URLSearchParams(location.search).get("tab")) || null;
  if (forcedTab) {
    document.documentElement.classList.add("expanded");
    el.expand.hidden = true;
  }

  // Load the saved preferences and reflect them in the controls.
  settings = await spLoadSettings();
  el.fontSize.value = settings.fontSize;
  el.serif.checked = settings.serif;
  el.paper.value = settings.paper;
  el.duplex.checked = settings.duplex;
  el.comments.checked = settings.comments;

  // Wire up the controls.
  bindEvents();

  // Find the target tab and extract its content (selection, else article).
  try {
    if (forcedTab) {
      activeTabId = forcedTab;
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTabId = tab.id;
    }
    payload = await spExtractFromTab(activeTabId, "auto");
  } catch (e) {
    payload = null;
  }

  // Pages Chrome won't let extensions touch (chrome://, Web Store, etc.).
  if (!payload) {
    showStatus("NerdPerfect Printer can't read this page (Chrome blocks extensions here).", "error");
    return;
  }

  // Ready — enable printing and draw the first preview.
  el.printOne.disabled = false;
  el.printAll.disabled = false;
  renderPreview();
}


// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function bindEvents() {
  // Font size: a fixed menu of the allowed sizes — save and reflow.
  el.fontSize.addEventListener("change", () => {
    settings.fontSize = Number(el.fontSize.value);
    spSaveSettings(settings);
    renderPreview();
  });

  // Serif checkbox: save and reflow immediately.
  el.serif.addEventListener("change", () => {
    settings.serif = el.serif.checked;
    spSaveSettings(settings);
    renderPreview();
  });

  // Paper size: save and reflow immediately.
  el.paper.addEventListener("change", () => {
    settings.paper = el.paper.value;
    spSaveSettings(settings);
    renderPreview();
  });

  // Duplex flag: save only — it changes what "Print first sheet" fits,
  // not how the preview looks.
  el.duplex.addEventListener("change", () => {
    settings.duplex = el.duplex.checked;
    spSaveSettings(settings);
  });

  // Print-comments flag: save and reflow (comments appear in the preview).
  el.comments.addEventListener("change", () => {
    settings.comments = el.comments.checked;
    spSaveSettings(settings);
    renderPreview();
  });

  // The two print buttons.
  el.printAll.addEventListener("click", () => printJob(false));
  el.printOne.addEventListener("click", () => printJob(true));

  // Expand: reopen this UI in a real, drag-resizable window (Chrome caps
  // toolbar popups at 800x600 and they can't be resized).
  el.expand.addEventListener("click", () => {
    if (!activeTabId) return;

    chrome.windows.create({
      url: chrome.runtime.getURL("popup.html") + "?tab=" + activeTabId,
      type: "popup",
      width: 940,
      height: 1050,
    });

    window.close();
  });

  // In the resizable window, re-render to fit after a resize (coalesced).
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (payload) renderPreview();
    }, 150);
  });
}


// ---------------------------------------------------------------------------
// Rendering a print document into an iframe
// ---------------------------------------------------------------------------

// Write the full print document (print.css + header/content/footer) into an
// iframe at true paper width, then wait for stylesheet and images so the
// layout is measurable. Used by both the preview and the measure iframe.
async function renderDocInto(iframe, contentHtml) {
  const doc = iframe.contentDocument;

  // Fresh document shell pointing at the real print stylesheet.
  doc.open();
  doc.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="' + chrome.runtime.getURL("print.css") + '">' +
    "</head><body></body></html>"
  );
  doc.close();

  // Apply the user's font/paper choices via the CSS custom properties.
  spApplyPrintVars(doc, settings, payload.siteFont);

  // Screen padding off — preview and measurement want bare content geometry.
  doc.body.style.padding = "0";
  doc.body.style.margin = "0";

  // No scrollbars, ever: a late-arriving image would otherwise grow the
  // content past the iframe and the scrollbar would clip the right edge.
  doc.documentElement.style.overflow = "hidden";

  // Inject the assembled printout body.
  doc.body.innerHTML = spBuildBodyHtml(payload, contentHtml);

  // Wait for print.css to actually load — measuring before it applies
  // would produce garbage geometry.
  const link = doc.querySelector("link[rel=stylesheet]");
  await new Promise((resolve) => {
    if (link.sheet) return resolve();
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", resolve, { once: true });
  });

  // Images change heights as they arrive — wait for them (with timeout).
  await spWaitForImages(doc, 3000);

  return doc;
}


// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

// Monotonic token so a stale async render can't clobber a newer one.
let renderToken = 0;

// Watcher that re-syncs the preview when slow images change its height.
let previewResizeObserver = null;

async function renderPreview() {
  const token = ++renderToken;
  const metrics = spPaperMetrics(settings.paper);

  // Stop watching the previous preview document.
  if (previewResizeObserver) {
    previewResizeObserver.disconnect();
    previewResizeObserver = null;
  }

  // Render the real document into the preview iframe at full sheet width.
  el.preview.style.width = metrics.paperWidthPx + "px";
  const doc = await renderDocInto(el.preview, spComposeContentHtml(payload, settings));
  if (token !== renderToken) return;   // superseded by a newer render

  // Restructure the document into a hidden measuring flow plus a stack
  // of visible paper sheets.
  setupPreviewSheets(doc, metrics);

  // Build the sheets for the current content height.
  syncPreviewGeometry(doc, metrics);

  // Images can keep arriving after first paint — rebuild the sheets
  // whenever the flowed content grows so the pagination stays honest.
  const flow = doc.querySelector(".pv-flow");
  previewResizeObserver = new doc.defaultView.ResizeObserver(() => {
    if (token === renderToken) syncPreviewGeometry(doc, metrics);
  });
  previewResizeObserver.observe(flow);
}

// Vertical gap between sheets in the preview, px (pre-scaling).
const SHEET_GAP = 18;

// Turn the flat print document into preview furniture: the original body
// content moves into an off-screen ".pv-flow" (laid out at printable width,
// used purely for measurement), and an empty ".pv-sheets" container is
// added for the visible pages.
function setupPreviewSheets(doc, metrics) {
  // Preview-only styles; print.css itself stays purely about the printout.
  const style = doc.createElement("style");
  style.textContent = `
    html { background: transparent; }
    body { width: auto !important; background: transparent !important; }
    .pv-flow {
      position: absolute; left: -20000px; top: 0;
      width: ${metrics.contentWidthPx}px;
      visibility: hidden;
    }
    .pv-sheet {
      position: relative;
      width: ${metrics.paperWidthPx}px;
      height: ${metrics.paperHeightPx}px;
      background: #fff;
      box-shadow: 0 1px 5px rgba(0, 0, 0, 0.3);
      margin: 0 0 ${SHEET_GAP}px;
      overflow: hidden;
    }
    .pv-hf {
      position: absolute; left: 24px; right: 24px;
      display: flex; justify-content: space-between; gap: 24px;
      font: 10px system-ui, sans-serif; color: #333;
    }
    .pv-hf span {
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .pv-hf span:last-child { max-width: 60%; }
    .pv-header { top: 9px; }
    .pv-footer { bottom: 9px; }
    .pv-clip {
      width: ${metrics.contentWidthPx}px;
      height: ${metrics.contentHeightPx}px;
      margin: ${metrics.marginPx}px auto 0;
      overflow: hidden;
    }
    .pv-inner { width: ${metrics.contentWidthPx}px; }
  `;
  doc.head.appendChild(style);

  // Move the rendered printout into the hidden flow.
  const flow = doc.createElement("div");
  flow.className = "pv-flow";
  while (doc.body.firstChild) flow.appendChild(doc.body.firstChild);
  doc.body.appendChild(flow);

  // Container the visible sheets get built into.
  const sheets = doc.createElement("div");
  sheets.className = "pv-sheets";
  doc.body.appendChild(sheets);
}

// Y positions (relative to the flow's top) where a page may break without
// slicing through a line of text, an image, or a figure — the same rule
// the print engine follows when it pushes a straddling line to the next
// page.
function computePageBreaks(doc, flow, pageH) {
  const flowTop = flow.getBoundingClientRect().top;
  const flowHeight = Math.max(flow.scrollHeight, 1);

  // Collect the vertical extent of every unbreakable atom: each text
  // line box, plus images/figures (break-inside: avoid keeps those whole).
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

// Measure the flowed content and rebuild the sheet stack to match: each
// sheet shows the slice of a full clone that ends at the last line that
// fits, exactly like paper does.
function syncPreviewGeometry(doc, metrics) {
  const flow = doc.querySelector(".pv-flow");
  const sheets = doc.querySelector(".pv-sheets");

  // Where each page starts, breaking only between lines.
  const { breaks, flowHeight } = computePageBreaks(doc, flow, metrics.contentHeightPx);
  const pages = breaks.length;

  // Rebuild the sheets: sheet k clips from its break to the next one.
  sheets.textContent = "";
  for (let k = 0; k < pages; k++) {
    const sliceTop = breaks[k];
    const sliceBottom = k + 1 < pages ? breaks[k + 1] : flowHeight;

    const sheet = doc.createElement("div");
    sheet.className = "pv-sheet";

    const clip = doc.createElement("div");
    clip.className = "pv-clip";
    clip.style.height = Math.min(metrics.contentHeightPx, sliceBottom - sliceTop) + "px";

    const inner = flow.cloneNode(true);
    inner.className = "pv-inner";
    inner.style.marginTop = -sliceTop + "px";

    clip.appendChild(inner);
    sheet.appendChild(clip);

    // Simulate Chrome's own print headers/footers (date + title on top,
    // URL + page number below), matching what actually prints when
    // "Headers and footers" is checked in the print dialog. Printing
    // happens in the article's own tab, so Chrome shows the real page
    // title and URL.
    sheet.appendChild(makeHeaderFooter(doc, "pv-header", chromePrintDate(), payload.pageTitle || payload.title));
    sheet.appendChild(makeHeaderFooter(doc, "pv-footer", payload.url, (k + 1) + "/" + pages));

    sheets.appendChild(sheet);
  }

  // Size the iframe to the sheet stack and scale it to the popup width.
  const stackHeight = pages * (metrics.paperHeightPx + SHEET_GAP);
  el.preview.style.height = stackHeight + "px";

  const availWidth = el.previewArea.clientWidth - 28;
  const scale = Math.min(1, availWidth / metrics.paperWidthPx);
  el.preview.style.transform = `scale(${scale})`;
  el.sheetWrap.style.width = Math.round(metrics.paperWidthPx * scale) + "px";
  el.sheetWrap.style.height = Math.round(stackHeight * scale) + "px";

  // Status line: the page count.
  updateStatus(pages);
}

// One simulated Chrome header or footer line: left and right text spans.
function makeHeaderFooter(doc, cls, leftText, rightText) {
  const bar = doc.createElement("div");
  bar.className = "pv-hf " + cls;

  const left = doc.createElement("span");
  left.textContent = leftText;

  const right = doc.createElement("span");
  right.textContent = rightText;

  bar.append(left, right);
  return bar;
}

// The date format Chrome uses in its print header (e.g. "7/7/26, 2:31 PM").
function chromePrintDate() {
  return new Date().toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

// Status line text for the normal (non-error) case: just the page count.
// How the content was obtained (article vs whole page) is not the user's
// problem — the preview speaks for itself. Selection mode is still called
// out, confirming the selection was picked up.
function updateStatus(pages) {
  const pageText = pages === 1 ? "≈ 1 page" : `≈ ${pages} pages`;

  const prefix = payload.mode === "selection" ? "Selected text — " : "";

  showStatus(`${prefix}${pageText} at current settings.`, "");
}

function showStatus(text, flavor) {
  el.status.textContent = text;
  el.status.className = flavor;
}


// ---------------------------------------------------------------------------
// One-sheet truncation
// ---------------------------------------------------------------------------

// Produce content HTML truncated to fit one physical sheet (2 pages
// duplex, 1 page single-sided) at the current settings, cut wherever it
// lands (mid-paragraph is fine), with "…" appended. Returns null when
// everything already fits.
async function buildOneSheetHtml() {
  // Lay out the full document in the hidden measurement iframe.
  el.measure.style.width = spPaperMetrics(settings.paper).contentWidthPx + "px";
  const doc = await renderDocInto(el.measure, spComposeContentHtml(payload, settings));

  // Accuracy beats latency here: image heights move the cut point, so give
  // slow ones extra time beyond renderDocInto's short preview-oriented wait.
  await spWaitForImages(doc, 8000);

  const metrics = spPaperMetrics(settings.paper);

  // One physical sheet: both sides on a double-sided printer, one side
  // on a single-sided one.
  const pagesPerSheet = settings.duplex ? 2 : 1;

  const content = doc.querySelector(".sp-content");
  const footer = doc.querySelector(".sp-footer");

  // Paginate exactly like the preview and the print engine do: straddling
  // lines and images get pushed to the next page. Plain height division
  // misses that — an image shoved whole onto page 2 can cascade content
  // onto page 3 (seen with the Substack flag image).
  const paged = computePageBreaks(doc, doc.body, metrics.contentHeightPx);

  // Already fits on the sheet? Print everything, no ellipsis.
  if (paged.breaks.length <= pagesPerSheet) return null;

  // The Y where the first page BEYOND the sheet starts. Removing trailing
  // content never reflows what's above it, so this stays valid after the
  // cut below.
  const limit = paged.breaks[pagesPerSheet];

  // Reserve room for the footer, which follows the truncated content.
  const footerStyle = doc.defaultView.getComputedStyle(footer);
  const footerSpace =
    footer.getBoundingClientRect().height +
    (parseFloat(footerStyle.marginTop) || 0) +
    (parseFloat(footerStyle.paddingTop) || 0);

  // The real print engine packs pages a line or two differently than our
  // model (heading keeps, rounding), so leave a cushion of ~3 text lines
  // rather than filling the sheet to the last pixel — otherwise the
  // footer gets squeezed onto an extra page.
  const cushion = Math.ceil(3 * 1.45 * settings.fontSize * (96 / 72));

  // Cut the content tree at the height budget.
  cutTree(content, Math.max(50, limit - footerSpace - cushion));

  // Append the ellipsis at the cut point.
  const ellipsis = doc.createTextNode(" …");
  placeEllipsis(content, ellipsis);

  // Safety loop: repaginate and shave trailing words until nothing spills
  // onto an extra page AND the footer clears the cushion.
  let guard = 120;
  while (
    (computePageBreaks(doc, doc.body, metrics.contentHeightPx).breaks.length > pagesPerSheet ||
      footer.getBoundingClientRect().bottom > limit - cushion) &&
    guard-- > 0
  ) {
    const tn = lastTextNode(content, ellipsis);
    if (!tn) break;

    // Several words at a time — repagination is the expensive step here.
    tn.data = tn.data.replace(/(\s*\S+){1,8}\s*$/, "");
    if (!tn.data.trim()) removeWithEmptyAncestors(tn, content);

    placeEllipsis(content, ellipsis);
  }

  return content.innerHTML;
}

// Elements that can't be meaningfully half-printed — drop them whole when
// they straddle the cut.
function isAtomic(node) {
  return /^(IMG|FIGURE|PICTURE|TABLE|SVG|VIDEO|HR)$/.test(node.tagName);
}

// Recursively cut `el`'s subtree so nothing renders below `allowed` px:
// keep children that fit, descend into the straddling container or
// word-trim the straddling text block, and drop everything after it.
function cutTree(root, allowed) {
  for (const child of Array.from(root.children)) {
    const rect = child.getBoundingClientRect();

    // Invisible or fully above the cut — keep and move on.
    if (rect.height === 0 || rect.bottom <= allowed) continue;

    // This child crosses the cut. Everything after it goes, always.
    while (child.nextSibling) child.nextSibling.remove();

    if (rect.top > allowed - 16) {
      // Barely any of it would fit — drop it whole.
      child.remove();
    } else if (isAtomic(child)) {
      // Images, figures, tables: all or nothing — here, nothing.
      child.remove();
    } else if (child.children.length > 0 && child.querySelector("p, li, div, blockquote, h1, h2, h3, h4, h5, h6")) {
      // A container with block structure — recurse into it.
      cutTree(child, allowed);

      // If nothing useful survived inside, drop the husk.
      if (!child.textContent.trim() && !child.querySelector("img")) child.remove();
    } else {
      // A leaf text block (paragraph etc.) — trim words off the end
      // until it fits.
      trimWords(child, allowed);
    }

    return;   // the cut point is handled; nothing further to scan
  }
}

// Remove words from the end of a text block until its bottom edge is
// above `allowed`. Preserves inline formatting (bold, links, …) because
// only text node data is trimmed.
function trimWords(block, allowed) {
  // Snapshot the block's text nodes once; work backwards from the end.
  const doc = block.ownerDocument;
  const nodes = [];
  const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) nodes.push(walker.currentNode);

  let guard = 8000;
  while (nodes.length && block.getBoundingClientRect().bottom > allowed && guard-- > 0) {
    const tn = nodes[nodes.length - 1];

    // Strip one trailing word.
    tn.data = tn.data.replace(/\s*\S+\s*$/, "");

    // When a node empties, remove it (and any now-empty inline wrappers).
    if (!tn.data.trim()) {
      removeWithEmptyAncestors(tn, block);
      nodes.pop();
    }
  }

  // If nothing survived, remove the block entirely.
  if (!block.textContent.trim()) block.remove();
}

// The last non-whitespace text node under `root`, skipping `skip`.
function lastTextNode(root, skip) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let last = null;
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n !== skip && n.data.trim()) last = n;
  }
  return last;
}

// Remove a node, then unwind any ancestors that became empty, stopping
// well short of `stop`.
function removeWithEmptyAncestors(node, stop) {
  let parent = node.parentNode;
  node.remove();

  while (parent && parent !== stop && !parent.childNodes.length) {
    const next = parent.parentNode;
    parent.remove();
    parent = next;
  }
}

// Keep the ellipsis glued to the current end of the content: right after
// the last text node, or as its own paragraph when content ends with an
// image (or is empty).
function placeEllipsis(content, ellipsis) {
  const tn = lastTextNode(content, ellipsis);

  if (tn) {
    tn.after(ellipsis);
  } else {
    const p = content.ownerDocument.createElement("p");
    p.appendChild(ellipsis);
    content.appendChild(p);
  }
}


// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

// Hand a print job to the service worker (which opens the render tab) and
// close the popup. oneSheet=true routes through the truncation pass first.
async function printJob(oneSheet) {
  el.printOne.disabled = true;
  el.printAll.disabled = true;

  try {
    // One-sheet mode: compute the truncated content (null = fits already).
    let contentHtml = null;
    if (oneSheet) {
      showStatus("Fitting to one sheet…", "");
      contentHtml = await buildOneSheetHtml();
    }

    // Hand off to the service worker, which injects the in-page printer
    // into the article's tab (this popup is about to close, so it can't
    // run the injection itself).
    await chrome.runtime.sendMessage({
      type: "print-in-page",
      tabId: activeTabId,
      payload,
      settings,
      contentHtml,
    });

    window.close();
  } catch (e) {
    showStatus("Printing failed: " + e.message, "error");
    el.printOne.disabled = false;
    el.printAll.disabled = false;
  }
}
