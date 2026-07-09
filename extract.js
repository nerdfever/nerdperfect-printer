// NerdPerfect Printer — extract.js
// Original author: Claude Fable 5, 2026-07-07
//
// Content script, injected on demand into the page's isolated world AFTER
// shared.js and vendor/readability.js (see spExtractFromTab in shared.js).
// It never modifies the live page — everything happens on clones.
//
// The whole file is a single IIFE whose return value becomes the
// executeScript result: a payload object describing what to print.
// No top-level bindings, so repeated injection is harmless.

(() => {
  "use strict";

  // -------------------------------------------------------------------------
  // Mode requested by the caller: "auto" | "article" | "selection".
  // -------------------------------------------------------------------------
  const requestedMode = self.__smartPrintMode || "auto";
  delete self.__smartPrintMode;


  // -------------------------------------------------------------------------
  // Small helpers
  // -------------------------------------------------------------------------

  // Rewrite URLs in a detached subtree so they survive re-rendering inside
  // an extension page: absolute img sources and link targets.
  function absolutizeUrls(root) {
    // Flatten <picture> wrappers to their <img>: the chosen source gets
    // baked into src below, and leftover <source> entries only give the
    // print tab ways to disagree with what the user saw.
    for (const pic of root.querySelectorAll("picture")) {
      const img = pic.querySelector("img");
      if (img) pic.replaceWith(img);
      else pic.remove();
    }

    // Images: bake in the URL the browser actually displays (resolves
    // lazy-loading and srcset), and drop srcset so it stays that way.
    for (const img of root.querySelectorAll("img")) {
      const src = img.currentSrc || img.src;
      if (src) img.setAttribute("src", src);
      img.removeAttribute("srcset");
      img.removeAttribute("sizes");
      img.removeAttribute("loading");
    }

    // Links: absolute hrefs (they print as underlined text, but keep them
    // valid in case the render tab is inspected).
    for (const a of root.querySelectorAll("a[href]")) {
      if (a.href) a.setAttribute("href", a.href);
    }
  }

  // Remove elements that must never reach the print template.
  function removeJunk(root) {
    for (const el of root.querySelectorAll("script, style, noscript, template, link")) {
      el.remove();
    }
  }

  // Remove every element in a subtree matching a selector list.
  function removeMatching(root, selectors) {
    for (const el of root.querySelectorAll(selectors)) {
      el.remove();
    }
  }

  // Safety-net comment stripping (full-article/fallback modes ONLY —
  // never for selections). Selector list lives in shared.js.
  function stripComments(root) {
    removeMatching(root, SP_COMMENT_SELECTORS);
  }

  // Strip injected ad units (full-article/fallback modes only). Selector
  // list lives in shared.js — see the note there on why ads must go
  // BEFORE Readability, not just after.
  function stripAds(root) {
    removeMatching(root, SP_AD_SELECTORS);
  }

  // Strip blocks the page itself marks as non-content via data-nosnippet
  // (author bios, byline chrome, sharing rails — XDA marks all of these).
  // Size-guarded so a site that wraps its whole article in data-nosnippet
  // (a paywall trick) loses nothing: only small blocks are removed.
  function stripNoSnippet(root, pageTextLen) {
    for (const el of root.querySelectorAll("[data-nosnippet]")) {
      const textLen = (el.textContent || "").trim().length;

      if (textLen < 0.2 * pageTextLen) el.remove();
    }
  }

  // Serialize the page's comment threads, for the optional "Print
  // comments" setting. Takes top-level comment containers only (skipping
  // matches nested inside one another) and ignores text-free UI scraps
  // like comment-count buttons. Only comments already loaded in the DOM
  // can be captured — lazy-loaded tails don't exist yet.
  function extractComments() {
    const tops = [];
    for (const el of document.querySelectorAll(SP_COMMENT_SELECTORS)) {
      if (tops.some((prev) => prev.contains(el))) continue;
      tops.push(el);
    }

    const container = document.createElement("div");
    for (const el of tops) {
      if ((el.textContent || "").trim().length < 80) continue;
      container.appendChild(el.cloneNode(true));
    }

    removeJunk(container);
    absolutizeUrls(container);

    return container.innerHTML;
  }

  // Capture the page's body font stack from computed style, probing a
  // real article paragraph when one exists.
  function captureSiteFont() {
    const probe =
      document.querySelector("article p, main p, p") || document.body;
    return getComputedStyle(probe).fontFamily || "";
  }

  // The page's reference body-text size, for spotting "small print".
  // A single probe paragraph is too fragile: if the document's first <p>
  // happens to be an oversized lede/deck, every normal paragraph looks
  // "small" next to it and the whole article prints shrunken (seen on
  // xda-developers). Instead, take the character-weighted median size
  // across all paragraphs with substantial text.
  const baseFontPx = (() => {
    // Gather (size, chars) samples from every paragraph with real text.
    const samples = [];
    for (const p of document.querySelectorAll("p")) {
      const chars = (p.textContent || "").trim().length;
      if (chars < 40) continue;

      const size = parseFloat(getComputedStyle(p).fontSize);
      if (size) samples.push({ size, chars });
    }

    // No usable paragraphs → fall back to a single probe, as before.
    if (!samples.length) {
      const probe =
        document.querySelector("article p, main p, p") || document.body;
      return parseFloat(getComputedStyle(probe).fontSize) || 16;
    }

    // Character-weighted median: the size in effect at the midpoint of
    // the page's paragraph text — one oversized outlier can't drag it.
    samples.sort((a, b) => a.size - b.size);

    const half = samples.reduce((sum, s) => sum + s.chars, 0) / 2;
    let seen = 0;
    for (const s of samples) {
      seen += s.chars;
      if (seen >= half) return s.size;
    }

    // Unreachable (the loop always crosses the midpoint), but explicit.
    return samples[samples.length - 1].size;
  })();

  // Does the element directly contain rendered text of its own (not just
  // text nested inside child elements)? Pure containers fail this test.
  function hasOwnText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length >= 4) {
        return true;
      }
    }

    return false;
  }

  // Does the live element render as de-emphasized small print (author
  // bios, image credits, disclaimers)?
  function isSmallPrint(liveEl) {
    // Only elements that render text of their own can be small print.
    // Tagging a mere container would shrink every descendant through the
    // `[data-sp-small] *` print rule — even paragraphs that override the
    // size back UP (xda-developers puts 10px on its article containers
    // while the paragraphs inside them are 18px).
    if (!hasOwnText(liveEl)) return false;

    const size = parseFloat(getComputedStyle(liveEl).fontSize);
    return Boolean(size) && size <= baseFontPx * 0.82;
  }

  // Tag small-print elements in a full document clone so the printout can
  // keep them de-emphasized. Walks the live document and the clone in
  // lockstep — their structures are identical right after cloning.
  function tagSmallPrint(docClone) {
    const live = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
    const copy = docClone.createTreeWalker(docClone.documentElement, NodeFilter.SHOW_ELEMENT);

    while (live.nextNode() && copy.nextNode()) {
      if (isSmallPrint(live.currentNode)) {
        copy.currentNode.setAttribute("data-sp-small", "1");
      }
    }
  }


  // -------------------------------------------------------------------------
  // Selection mode: serialize exactly what the user selected, verbatim.
  // -------------------------------------------------------------------------
  function extractSelection() {
    const sel = window.getSelection();

    // No usable selection → signal the caller to fall through to article mode.
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;

    // Clone every range of the selection into one container, in order.
    const container = document.createElement("div");
    for (let i = 0; i < sel.rangeCount; i++) {
      container.appendChild(sel.getRangeAt(i).cloneContents());
    }

    // Clean scripts/styles out of the clone, and make URLs portable.
    // NO comment stripping here — a selection prints verbatim.
    removeJunk(container);
    absolutizeUrls(container);

    return {
      mode: "selection",
      title: document.title,
      pageTitle: document.title,   // what Chrome's print header shows
      byline: "",
      url: location.href,
      siteFont: captureSiteFont(),
      html: container.innerHTML,
      commentsHtml: "",   // a selection prints verbatim, nothing appended
      notice: "",
    };
  }


  // -------------------------------------------------------------------------
  // Article mode: Readability on a clone of the document.
  // -------------------------------------------------------------------------
  function extractArticle() {
    // Work on a full document clone — Readability mutates its input.
    const docClone = document.cloneNode(true);

    // Mark the site's own small print while live and clone still match
    // node-for-node (must run before any mutation of the clone).
    tagSmallPrint(docClone);

    // Strip known comment containers BEFORE Readability runs, so it can't
    // mistake a huge comment thread for article content.
    stripComments(docClone);

    // Strip injected ad units, also before Readability — left in place,
    // a big ad inside the article body skews the scoring (see shared.js).
    stripAds(docClone);

    // Readability's junk heuristics discard containers whose text is mostly
    // links — which describes image credits like "Photo by X on Unsplash",
    // and takes the whole figure (image included) down with them. Unwrap
    // links inside figures so captions count as plain text; links print as
    // plain underlined text anyway. (Verified on Substack lead images.)
    for (const fig of docClone.querySelectorAll("figure")) {
      for (const a of fig.querySelectorAll("a")) {
        a.replaceWith(...a.childNodes);
      }
    }

    // Drop scripts/styles from the clone before measuring: pages carry
    // megabytes of inline JSON that would poison the sliver check below
    // (Readability strips them itself, so this changes nothing else).
    removeJunk(docClone);

    // Text length of the cleaned, comment-stripped page, captured before
    // Readability mutates the clone (needed for the sliver check below).
    const pageTextLen = (docClone.body ? docClone.body.textContent : "").trim().length;

    // Drop what the page itself marks as non-content (needs pageTextLen
    // for its size guard, so it runs after the measurement).
    stripNoSnippet(docClone, pageTextLen);

    // Run Readability; treat any exception as a parse failure.
    let article = null;
    try {
      article = new Readability(docClone).parse();
    } catch (e) {
      article = null;
    }

    // Reject empty or trivially short results as failures too.
    if (!article || !article.content || (article.textContent || "").trim().length < 40) {
      return null;
    }

    // A "successful" parse that captured only a sliver of the page means
    // this isn't really an article page — e.g. a search-results page,
    // where Readability latches onto one box (Google's AI Overview).
    // But long-form text is trusted even when portal chrome (trending
    // rails, related-article blocks, ads) dwarfs it by volume — on sites
    // like xda-developers the real article sits under 20% of page text.
    const articleTextLen = article.textContent.trim().length;
    if (articleTextLen < 0.2 * pageTextLen && articleTextLen < 4000) {
      return null;
    }

    // Strip comment containers AGAIN on the extracted markup (belt and
    // suspenders), then absolutize what Readability may have missed.
    const holder = document.createElement("template");
    holder.innerHTML = article.content;
    stripComments(holder.content);
    stripAds(holder.content);
    removeJunk(holder.content);
    absolutizeUrls(holder.content);

    return {
      mode: "article",
      title: article.title || document.title,
      pageTitle: document.title,   // what Chrome's print header shows
      byline: article.byline || "",
      url: location.href,
      siteFont: captureSiteFont(),
      html: holder.innerHTML,
      commentsHtml: extractComments(),
      notice: "",
    };
  }


  // -------------------------------------------------------------------------
  // Fallback mode: the VISIBLE page through the cleanup CSS, with a notice.
  // -------------------------------------------------------------------------

  // Deep-clone only what is actually visible on screen. The printout has
  // none of the site's stylesheets, so a plain clone would resurrect
  // everything the site hides via classes (menus, dialogs — a Google
  // results page carries dozens) and blow decorative inline SVG icons up
  // to column width.
  function cloneVisibleTree(liveEl) {
    // Skip whatever the site itself isn't showing.
    const cs = getComputedStyle(liveEl);
    if (cs.display === "none" || cs.visibility === "hidden") return null;
    if (liveEl.getAttribute("aria-hidden") === "true") return null;

    // "Screen-reader only" tricks hide things by clipping to ~1px rather
    // than display:none (skip-links, a11y labels) — skip those too.
    // EXCEPT display:contents elements: they generate no box at all, so
    // their rect is 0x0 by definition while their children render
    // normally. SPA frameworks (claude.ai among them) use them as
    // invisible wrappers around the entire app — the size test would
    // throw the whole page away.
    if (cs.display !== "contents") {
      const rect = liveEl.getBoundingClientRect();
      if (rect.width < 2 && rect.height < 2) return null;
    }

    // Skip machinery and decorative vectors outright.
    if (/^(script|style|noscript|template|link|svg|iframe)$/i.test(liveEl.tagName)) return null;

    // Shallow-copy this element, then recurse into its children.
    const copy = liveEl.cloneNode(false);

    // Keep the site's own de-emphasis: small print stays small on paper.
    if (isSmallPrint(liveEl)) copy.setAttribute("data-sp-small", "1");

    for (const child of liveEl.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        copy.appendChild(child.cloneNode());
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const kept = cloneVisibleTree(child);
        if (kept) copy.appendChild(kept);
      }
    }

    return copy;
  }

  function extractFallback() {
    const bodyClone = cloneVisibleTree(document.body) || document.createElement("div");

    // Navigation chrome has no meaning on paper.
    for (const el of bodyClone.querySelectorAll('nav, [role="navigation"], [role="banner"]')) {
      el.remove();
    }

    // Drop inline styles wholesale: they're all that's left to fight the
    // print layout (site stylesheets never reach the printout), and they
    // carry the negative margins and absolute offsets that make images
    // land on top of unrelated text.
    for (const el of bodyClone.querySelectorAll("[style]")) {
      el.removeAttribute("style");
    }

    // Same cleanup as article mode — comments must still never appear
    // in the page body itself, and ad scraps only waste ink.
    removeJunk(bodyClone);
    stripComments(bodyClone);
    stripAds(bodyClone);
    absolutizeUrls(bodyClone);

    return {
      mode: "fallback",
      title: document.title,
      pageTitle: document.title,   // what Chrome's print header shows
      byline: "",
      url: location.href,
      siteFont: captureSiteFont(),
      html: bodyClone.innerHTML,
      commentsHtml: extractComments(),
      notice: "Couldn't extract an article from this page — showing the whole page instead.",
    };
  }


  // -------------------------------------------------------------------------
  // Dispatch on mode and return the payload (= executeScript result).
  // -------------------------------------------------------------------------
  let payload = null;

  // Selection first when requested or in auto mode.
  if (requestedMode === "selection" || requestedMode === "auto") {
    payload = extractSelection();
  }

  // Article extraction when there was no selection, or it was forced.
  if (!payload) payload = extractArticle();

  // Last resort: the fallback rendering.
  if (!payload) payload = extractFallback();

  return payload;
})();
