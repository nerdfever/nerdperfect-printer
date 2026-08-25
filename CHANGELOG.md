# NerdPerfect Printer — change log

All notable changes, newest first. Written entirely by Claude
(Anthropic's AI), directed and published by [nerdfever.com](https://nerdfever.com).

## 1.13 — in progress (testing as 1.12.x builds)

- New escape hatch in the popup: "Print with browser's native engine",
  for the occasional page NerdPerfect handles badly. Chrome renders the
  page its own way (the print dialog shows that preview), with one
  repair applied: the usual cause of a trailing blank page is removed.
  The choice isn't saved — each popup starts fresh, and the five stored
  preferences stay exactly five.
- The right-click menu items no longer carry the version number (the
  popup title still does).
- Tidier popup: the checkboxes sit in order of use (Print comments,
  Browser-native print, force-font), and the expand-window button
  lives in the top-right corner.

- Sign-up boxes and other interactive forms no longer print — in any
  mode: small forms vanish entirely (their hidden inputs were leaving
  stray bullet markers and empty boxes on paper — seen on an
  order-confirmation page), while forms that wrap real content keep
  the content and lose only the controls.
- Receipt and confirmation pages print whole. Article extraction used
  to "succeed" on just the thank-you column and silently drop the
  order summary; a small parse that leaves real page content behind
  now prints the full page instead.

## 1.12 — 2026-08-23

- An image that almost fits at the bottom of a page is downscaled a
  little (never below 60%) to stay on the page with its text, instead
  of being pushed whole to the next page — a tall lead photo no longer
  strands the first page half-empty.
- Images the preview can't load (news-site CDNs that want the page's
  cookies; they print fine) now show as a correctly-sized placeholder
  labeled "image — appears when printed", so the preview's page count
  and layout match the printout.
- "Print all" prints exactly the content the preview showed.

## 1.11 — 2026-08-20

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
- Listing cards print more compactly — smaller type, no vertical air
  between a card's fragments — so a shop or order list reads like the
  screen's rows.
- Select-then-print now gets the same fidelity as whole-page mode: the
  selection prints what you see (no hidden duplicate text, and photos
  the site draws as CSS backgrounds are included), and a selected
  results grid prints as compact card rows.
- Printed comment threads keep their reply indentation, rebuilt from
  the on-screen nesting, so you can still see who answers whom.
- The right-click menu items show the version, like the popup title
  does — so it's always clear which installed copy handles the click.
- Reddit gets a dedicated renderer: posts print as a title line, one
  compact byline (subreddit, author, age, net votes with upvote ratio,
  comment count), and the content; comments print with the avatar
  beside the name, votes and age on the same line, and replies nested
  behind a thread guide line. The meme-thread test case went from 24
  printed pages to 5. Post images print reliably (the printout no
  longer carries reddit's live image components, which could blank the
  picture at print time even though the preview showed it).
- Listing cards use the page's width like the screen does: the details
  flow in two columns beside the thumbnail, halving card height
  without cramped spacing.
- Select-then-print drops the site's inline styles (as whole-page mode
  always has), so selections no longer inherit broken screen layout.
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
