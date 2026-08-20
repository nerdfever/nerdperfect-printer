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
      // Collapse whitespace before measuring — a sort-dropdown widget
      // can pad 74 chars of labels past 80 with raw indentation (Reddit).
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length < 80) continue;

      // Clone only what's actually rendered, same as fallback mode — a
      // raw clone drags in hovercards, tooltips, and hidden overlays
      // that print as pages of blank machinery (Reddit's comment tree).
      const kept = cloneVisibleTree(el);
      if (kept) container.appendChild(kept);
    }

    removeJunk(container);

    // Comment threads carry their own ads (Reddit interleaves ad units
    // between comments) and per-comment UI widgetry — neither prints.
    stripAds(container);
    removeMatching(container, SP_SITE_WIDGET_SELECTORS);

    // Rebuild the thread's reply indentation from the screen offsets.
    indentCommentThreads(container);

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

  // Remove from the clone everything the page doesn't actually render
  // (computed display:none / visibility:hidden), walking live and clone
  // in lockstep. Readability's own visibility test reads only INLINE
  // styles, so a huge class-hidden container of template text can win
  // its scoring outright — and print as nothing (amazon.com). Nodes are
  // collected during the walk and removed after, so the walkers stay in
  // sync; removing a child of an already-removed ancestor is a no-op.
  function pruneHiddenInClone(docClone) {
    const live = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);
    const copy = docClone.createTreeWalker(docClone.documentElement, NodeFilter.SHOW_ELEMENT);

    const doomed = [];
    while (live.nextNode() && copy.nextNode()) {
      const cs = getComputedStyle(live.currentNode);
      if (cs.display === "none" || cs.visibility === "hidden") {
        doomed.push(copy.currentNode);
      }
    }
    for (const el of doomed) el.remove();
  }


  // -------------------------------------------------------------------------
  // Selection mode: serialize exactly what the user selected, verbatim.
  // -------------------------------------------------------------------------
  function extractSelection() {
    const sel = window.getSelection();

    // No usable selection → signal the caller to fall through to article mode.
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return null;

    // Clone every range through the same visible-tree walk fallback
    // uses, restricted to the selected nodes. The selected CONTENT is
    // verbatim; what this changes is fidelity to the screen: hidden
    // machinery (offscreen text twins, hovercards) doesn't print, and
    // photos the site paints as CSS backgrounds do (aliexpress orders).
    const container = document.createElement("div");
    for (let i = 0; i < sel.rangeCount; i++) {
      const range = sel.getRangeAt(i);

      // Walk from the range's enclosing ELEMENT (the common ancestor
      // may be a text node for single-run selections).
      const root =
        range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement;

      const kept = cloneVisibleTree(root, range);
      if (kept) container.appendChild(kept);
    }

    // Clean scripts/styles out of the clone, and make URLs portable.
    // NO comment/ad stripping here — a selection prints verbatim.
    removeJunk(container);

    // Same visual-truth cleanups as fallback (nothing is filtered):
    // zoom/lightbox twins print once, a selected results grid retiles
    // as compact card rows, and selected comment threads keep their
    // reply indentation.
    dedupeImages(container);
    compactResultCards(container);
    indentCommentThreads(container);

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
    };
  }


  // Readability keeps one winning container; on some sites (TechSpot) the
  // lead/hero image sits OUTSIDE it — often wrapped in a lightbox link —
  // and silently vanishes from the result. When the extracted article has
  // NO image at all, recover the page's lead image: the largest
  // prominently-rendered image near the top of the page, strongly
  // preferring the one the site itself nominates via og:image. Articles
  // that already carry any image are never touched.
  function recoverLeadImage(holder) {
    if (holder.content.querySelector("img")) return;

    // Filename stem, with size-variant suffixes dropped, so the og:image
    // URL can be matched against responsive variants of the same file
    // ("2026-07-19-image.jpg" vs "2026-07-19-image-j_1100.webp").
    const stem = (u) => {
      const base = (u.split("/").pop() || "").split("?")[0];
      return base
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[-_](?:\d{2,4}w?|j|small|medium|large|thumb)$/gi, "");
    };

    const ogMeta = document.querySelector('meta[property="og:image"], meta[name="og:image"]');
    const ogStem = ogMeta && ogMeta.content ? stem(ogMeta.content) : "";

    let best = null;
    let bestScore = 0;
    for (const img of document.images) {
      const r = img.getBoundingClientRect();
      if (r.width < 400 || r.height < 200) continue;          // too small for a lead
      if (r.top + window.scrollY > 4000) continue;            // nowhere near the top
      if (img.closest("nav, header, footer, aside")) continue;

      const s = stem(img.currentSrc || img.src || "");
      const isOg =
        ogStem.length >= 6 && s.length >= 6 &&
        (s.startsWith(ogStem) || ogStem.startsWith(s));

      const score = r.width * r.height * (isOg ? 8 : 1);
      if (score > bestScore) {
        bestScore = score;
        best = img;
      }
    }
    if (!best) return;

    const fig = document.createElement("figure");
    const img = document.createElement("img");
    img.src = best.currentSrc || best.src;
    if (best.alt) img.alt = best.alt;
    fig.appendChild(img);
    holder.content.prepend(fig);
  }


  // -------------------------------------------------------------------------
  // Article mode: Readability on a clone of the document.
  // -------------------------------------------------------------------------
  function extractArticle() {
    // Work on a full document clone — Readability mutates its input.
    const docClone = document.cloneNode(true);

    // Mark the site's own small print while live and clone still match
    // node-for-node (must run before any mutation of the clone), then
    // drop everything the page doesn't render (also needs the lockstep
    // walk, so it comes right after and before any other mutation).
    tagSmallPrint(docClone);
    pruneHiddenInClone(docClone);

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

    // Listing pages (search results, shop grids) must never reach
    // Readability at all — it mangles them (stripping images and title
    // links) yet can "succeed" on sheer text volume. Decide from the
    // page's own structure, BEFORE parsing: grids of 4+ same-tag
    // siblings that each pair an image with real text, holding a large
    // share of the page's text, mean a listing. An article that merely
    // CONTAINS a gallery fails the share test — captions are a sliver
    // of an article's prose.
    if (pageTextLen) {
      let gridTextLen = 0;
      const countedCards = [];
      for (const container of docClone.querySelectorAll("div, ul, ol, section, main")) {
        // Skip grids nested inside an already-counted card.
        if (countedCards.some((card) => card.contains(container))) continue;

        const kids = Array.from(container.children).filter(
          (el) =>
            el.querySelector("img") &&
            (el.textContent || "").trim().length >= 30
        );
        if (kids.length < 4) continue;
        if (new Set(kids.map((el) => el.tagName)).size !== 1) continue;

        for (const kid of kids) {
          gridTextLen += (kid.textContent || "").trim().length;
          countedCards.push(kid);
        }
      }
      if (gridTextLen > 0.35 * pageTextLen) return null;
    }

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

    // A "successful" parse where most of the text lives inside links is a
    // results/listing page, not an article — Amazon searches sail past the
    // sliver check on sheer volume (16 product titles beat 4000 chars), but
    // no real article keeps the majority of its prose inside anchors.
    // Punt to fallback mode, which handles listing pages properly.
    const contentLen = (holder.content.textContent || "").trim().length;
    let linkLen = 0;
    for (const a of holder.content.querySelectorAll("a")) {
      linkLen += (a.textContent || "").trim().length;
    }
    const linkDensity = contentLen ? linkLen / contentLen : 0;
    if (linkDensity > 0.30) return null;

    absolutizeUrls(holder.content);
    recoverLeadImage(holder);

    return {
      mode: "article",
      title: article.title || document.title,
      pageTitle: document.title,   // what Chrome's print header shows
      byline: article.byline || "",
      url: location.href,
      siteFont: captureSiteFont(),
      html: holder.innerHTML,
      commentsHtml: extractComments(),
    };
  }


  // -------------------------------------------------------------------------
  // Fallback mode: the VISIBLE page through the cleanup CSS.
  // -------------------------------------------------------------------------

  // Deep-clone only what is actually visible on screen. The printout has
  // none of the site's stylesheets, so a plain clone would resurrect
  // everything the site hides via classes (menus, dialogs — a Google
  // results page carries dozens) and blow decorative inline SVG icons up
  // to column width.
  //
  // The optional `range` restricts the clone to a selection: elements
  // and text outside the range are skipped, and the boundary text nodes
  // are sliced at the range's offsets — used by selection mode so the
  // selected content gets the same visible-only treatment as fallback.
  function cloneVisibleTree(liveEl, range) {
    if (range && !range.intersectsNode(liveEl)) return null;
    // Skip whatever the site itself isn't showing. Note: aria-hidden is
    // deliberately NOT honored — it hides from screen readers, not from
    // sighted users, and sites mark visually-rendered content with it to
    // reduce screen-reader redundancy (Amazon puts it on every product
    // image link and visible price). What's truly invisible is caught by
    // the computed-style and size tests.
    const cs = getComputedStyle(liveEl);
    if (cs.display === "none" || cs.visibility === "hidden") return null;

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

      // Screen-reader-only text parked off the canvas (left:-9999px and
      // friends): a box entirely left of, or above, the document origin
      // is invisible by construction — and it DUPLICATES visible text,
      // so it must not print.
      if (rect.right + window.scrollX < 0 || rect.bottom + window.scrollY < 0) {
        return null;
      }

      // Another screen-reader-only trick: a normal-sized box whose
      // visible region is CLIPPED to nothing (clip: rect(0 0 0 0);
      // clip-path: inset(50%)).
      const clip = cs.clip;
      if (clip && clip !== "auto") {
        // rect(top, right, bottom, left) — visible w/h under 2px is hidden.
        const m = clip.match(/rect\(\s*([\d.]+)px[ ,]+([\d.]+)px[ ,]+([\d.]+)px[ ,]+([\d.]+)px/);
        if (m && m[2] - m[4] < 2 && m[3] - m[1] < 2) return null;
      }
      if (/inset\(\s*(?:50|100)%/.test(cs.clipPath || "")) return null;
    }

    // Skip machinery and decorative vectors outright.
    if (/^(script|style|noscript|template|link|svg|iframe)$/i.test(liveEl.tagName)) return null;

    // Shallow-copy this element, then recurse into its children.
    const copy = liveEl.cloneNode(false);

    // Record every image's rendered area, so later passes can tell a
    // product photo from a store badge (retiling picks the biggest
    // image in a card as its thumbnail). Icon-sized images are tagged
    // so print.css can cap them at icon size on paper too.
    if (liveEl.tagName === "IMG") {
      const r = liveEl.getBoundingClientRect();
      copy.setAttribute("data-sp-area", String(Math.round(r.width * r.height)));

      if (r.width <= SP_ICON_MAX_PX && r.height <= SP_ICON_MAX_PX) {
        copy.setAttribute("data-sp-icon", "1");
      }
    }

    // Shop sites often paint product photos as CSS backgrounds rather
    // than <img> (aliexpress order lists) — those clone as empty boxes
    // and the photo silently never prints. Bake a sufficiently large
    // background image into a real <img> child. Size-gated so icons and
    // sprite tricks stay off the paper.
    if (liveEl.tagName !== "IMG" && cs.backgroundImage && cs.backgroundImage.includes("url(")) {
      const r = liveEl.getBoundingClientRect();
      if (r.width >= SP_BG_IMAGE_MIN_PX && r.height >= SP_BG_IMAGE_MIN_PX) {
        const m = cs.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
        if (m && /^(https?:|data:)/.test(m[1])) {
          const img = document.createElement("img");
          img.src = m[1];
          img.setAttribute("data-sp-area", String(Math.round(r.width * r.height)));
          copy.appendChild(img);
        }
      }
    }

    // Comment-ish elements record their rendered left edge, so reply
    // indentation can be rebuilt on paper — threads lose who-answers-
    // whom when reflowed (see indentCommentThreads).
    if (/comment/i.test(liveEl.tagName) || /comment/i.test(String(liveEl.className))) {
      copy.setAttribute("data-sp-left", String(Math.round(liveEl.getBoundingClientRect().left)));
    }

    // Keep the site's own de-emphasis: small print stays small on paper.
    if (isSmallPrint(liveEl)) copy.setAttribute("data-sp-small", "1");

    for (const child of liveEl.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        // Outside a selection range: skip. On its boundary: slice the
        // text at the range offsets so only the selected part prints.
        if (range && !range.intersectsNode(child)) continue;

        let text = child.textContent;
        if (range) {
          const start = child === range.startContainer ? range.startOffset : 0;
          const end = child === range.endContainer ? range.endOffset : text.length;
          text = text.slice(start, end);
        }

        if (text) copy.appendChild(document.createTextNode(text));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const kept = cloneVisibleTree(child, range);
        if (kept) copy.appendChild(kept);
      }
    }

    return copy;
  }

  // Results/listing pages (searches, category pages, shop grids) render as
  // grids of repeated "cards" — an image paired with title/price/details.
  // Linearized into our single column, every tile becomes a tall stack of
  // fragments and the printout runs to dozens of pages. Detect the
  // repetition and retile each card as a compact thumbnail-left row
  // (styled via [data-sp-card] rules in print.css). Fallback mode only.
  function compactResultCards(root) {
    for (const container of root.querySelectorAll("div, ul, ol, section, main")) {
      // Skip grids nested inside an already-retiled card.
      if (container.closest("[data-sp-card]")) continue;

      // Candidate cards: direct children that each pair an image with a
      // meaningful amount of text. Four or more siblings of the same tag
      // doing that is a results grid, not article content.
      const cards = Array.from(container.children).filter(
        (el) =>
          el.querySelector("img") &&
          (el.textContent || "").trim().length >= 30
      );
      if (cards.length < 4) continue;
      if (new Set(cards.map((el) => el.tagName)).size !== 1) continue;

      for (const card of cards) {
        // Everything the card had moves into a details cell; its first
        // (main) image moves out front into a thumbnail cell.
        const body = document.createElement("div");
        body.setAttribute("data-sp-card-body", "1");
        while (card.firstChild) body.appendChild(card.firstChild);

        // The card's most prominent image becomes the thumbnail — chosen
        // by rendered area captured at clone time, because the FIRST
        // image in a card is often a store badge, not the product photo
        // (aliexpress puts its "Choice" badge above the item picture).
        const imgs = Array.from(body.querySelectorAll("img"));
        imgs.sort(
          (a, b) =>
            (Number(b.getAttribute("data-sp-area")) || 0) -
            (Number(a.getAttribute("data-sp-area")) || 0)
        );

        const img = imgs[0];
        if (img) {
          const thumb = document.createElement("div");
          thumb.setAttribute("data-sp-card-thumb", "1");
          thumb.appendChild(img);
          card.appendChild(thumb);
        }

        card.appendChild(body);
        card.setAttribute("data-sp-card", "1");
      }
    }
  }

  // Shop/search pages surround their results with furniture no landmark
  // selector can name: account sidebars, app-promo boxes, tab bars,
  // "Need help?" widgets (seen on the aliexpress order list — its menus
  // are styled divs, not <nav>, and not even links, so link density is
  // useless as a signal). Structure is the reliable signal: the junk is
  // always a small card-less sliver flanking one dominant column that
  // leads down to the retiled cards. Walk down that spine — whenever one
  // child holds the dominant share of a node's text, drop its small
  // card-less flanks and descend. Stop at the card grid itself, at any
  // substantial card-less flank (real prose must never be cut), or when
  // no child dominates. Runs ONLY on pages that actually retiled cards,
  // so prose fallbacks (chat transcripts) are never touched.
  function pruneListingFurniture(root) {
    if (!root.querySelector("[data-sp-card]")) return;

    const textLen = (el) => (el.textContent || "").trim().length;

    let node = root;
    while (true) {
      // Reached the level of the cards themselves — done.
      if (node.querySelector(":scope > [data-sp-card]")) return;

      const total = textLen(node);
      if (!total) return;

      // The spine: the one child carrying most of the remaining text.
      const kids = Array.from(node.children);
      const spine = kids.find((el) => textLen(el) >= SP_SPINE_DOMINANT_SHARE * total);
      if (!spine) return;

      // A card-less flank with substantial text is real prose, not
      // furniture — stop before removing anything at this level.
      const flanks = kids.filter((el) => el !== spine && !el.querySelector("[data-sp-card]"));
      if (flanks.some((el) => textLen(el) >= SP_SPINE_FLANK_MAX_CHARS)) return;

      for (const el of flanks) el.remove();

      node = spine;
    }
  }

  // Threaded comments lose their reply indentation when reflowed — the
  // screen shows nesting by left offset, which the clone walk stamps on
  // comment-ish elements as data-sp-left. Convert each element's offset
  // into a print margin, measured relative to its nearest stamped
  // ancestor (nested replies accumulate their parents' margins), scaled
  // down and capped per step so deep threads can't eat the column.
  function indentCommentThreads(root) {
    const nodes = Array.from(root.querySelectorAll("[data-sp-left]"));

    // Compute every margin BEFORE stripping the attributes the
    // ancestor lookups depend on.
    const margins = new Map();
    for (const el of nodes) {
      const left = Number(el.getAttribute("data-sp-left")) || 0;

      const anchor = el.parentElement && el.parentElement.closest("[data-sp-left]");
      const anchorLeft = anchor ? Number(anchor.getAttribute("data-sp-left")) || 0 : left;

      const indent = Math.min(
        Math.max(0, (left - anchorLeft) * SP_COMMENT_INDENT_SCALE),
        SP_COMMENT_INDENT_STEP_MAX_PX
      );
      if (indent >= 3) margins.set(el, indent);
    }

    for (const el of nodes) {
      const margin = margins.get(el);
      if (margin) el.style.marginLeft = Math.round(margin) + "px";
      el.removeAttribute("data-sp-left");
    }
  }

  // Sites can render the same picture twice — zoom/lightbox twins
  // stacked exactly on the visible copy, so both pass every visibility
  // test (Reddit post images). On paper one copy is right: drop
  // exact-src repeats, keeping the first.
  function dedupeImages(root) {
    const seen = new Set();
    for (const img of root.querySelectorAll("img")) {
      const src = img.getAttribute("src") || "";
      if (!src) continue;

      if (seen.has(src)) img.remove();
      else seen.add(src);
    }
  }

  function extractFallback() {
    const bodyClone = cloneVisibleTree(document.body) || document.createElement("div");

    // Site furniture has no meaning on paper (selector list in shared.js).
    removeMatching(bodyClone, SP_FALLBACK_CHROME_SELECTORS);

    // Drop inline styles wholesale: they're all that's left to fight the
    // print layout (site stylesheets never reach the printout), and they
    // carry the negative margins and absolute offsets that make images
    // land on top of unrelated text.
    for (const el of bodyClone.querySelectorAll("[style]")) {
      el.removeAttribute("style");
    }

    // Same cleanup as article mode — comments must still never appear
    // in the page body itself, and ad scraps only waste ink. Interactive
    // widget shells (share/award rows, overflow menus) go with them.
    removeJunk(bodyClone);
    stripComments(bodyClone);
    stripAds(bodyClone);
    removeMatching(bodyClone, SP_SITE_WIDGET_SELECTORS);
    dedupeImages(bodyClone);

    // Comment threads are stripped from fallback bodies above, but this
    // also cleans the clone-time offset stamps off whatever remains.
    indentCommentThreads(bodyClone);

    // Cross-sell recommendation rails go before card retiling, so their
    // product tiles never count as (or survive among) the page's cards.
    removeMatching(bodyClone, SP_RECOMMEND_SELECTORS);

    // Retile results grids AFTER the strips, so removed junk can't count
    // toward (or survive inside) a detected card.
    compactResultCards(bodyClone);

    // With the cards marked, prune the furniture flanking them.
    pruneListingFurniture(bodyClone);

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
