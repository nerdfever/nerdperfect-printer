# NerdPerfect Printer — change log

All notable changes, newest first. Written entirely by Claude
(Anthropic's AI), directed and published by [nerdfever.com](https://nerdfever.com).

## 1.11 — in progress (testing as 1.10.x builds)

- Account pages on shopping sites (order history and the like) now print
  just the content: account sidebars, app-promo boxes, and header bars
  are pruned from whole-page printouts. An AliExpress order list went
  from 13 pages to 5.
- "More to love"-style recommendation rails no longer print.
- Product photos that sites paint as CSS backgrounds (rather than real
  image tags) now print — AliExpress order lists were printing every
  order without its product picture.
- A listing card's thumbnail is now its most prominent image, not just
  the first one found (which was often a store badge).
- Reddit threads print sanely: a 100-page printout became 7. Ads (in
  the post, rails, and between comments), "Related posts" tiles, and
  sidebar sign-up columns are left off the paper; per-comment
  share/award/menu widgetry is stripped; comment threads keep only
  what's visible on screen (no more hidden hovercards printing as
  blank pages); avatars and badges stay icon-sized on paper; duplicate
  zoom/lightbox copies of a post's image print once.

## 1.10 — 2026-07-22

- The popup title now shows the version number.
- Clearer store summary and description.
- Shop and search pages (Amazon, Google results, and the like) are now
  recognized by their page structure, before article extraction runs.
  This fixes amazon.com printing a nearly empty page, and Google
  results losing their title links.
- Article extraction no longer considers content the page never
  displays (some sites carry huge hidden text blocks that could confuse
  it).

## 1.09 — 2026-07-21

- Shop and search listings print as compact rows — thumbnail on the
  left, title / price / rating on the right, never split across a page
  break — instead of a long stack of fragments.
- On listing pages, hidden screen-reader text no longer prints as
  doubled prices and ratings, and site furniture (navigation, filter
  sidebars, cookie banners, "Add to basket" buttons) is left off the
  paper.
- Articles whose lead image sits outside the main text container
  (e.g. TechSpot) get their lead image back.
- Fixed oversized images in whole-page printouts (a size cap that had
  silently stopped working).

## 1.08 — 2026-07-13

- Open source: MIT license, full source published at
  https://github.com/nerdfever/nerdperfect-printer.
- Store listing now explains each setting and credits Claude as the
  author.

## 1.07 — 2026-07-09

- The status line simply shows the page count.

## 1.06 — 2026-07-09

- Fixed some app-style pages (e.g. claude.ai) printing as an empty
  page in whole-page mode.

## 1.05 — 2026-07-08

- Images taller than a page are shrunk to fit on one page instead of
  being pushed to a page of their own.

## 1.02–1.04 — 2026-07-08

- Housekeeping: store-listing description length, homepage link.

## 1.01 — 2026-07-08

- Fixed shrunken body text on some sites, stray author bios, and
  content lost to injected ads.

## 1.00 — 2026-07-07

- Initial release: two-click printing with live paginated preview,
  article extraction (Mozilla Readability), selection printing,
  one-sheet truncation, comment handling, font and paper-size
  settings.
