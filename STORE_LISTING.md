# Chrome Web Store listing — NerdPerfect Printer

Copy for the Web Store developer dashboard. Not part of the extension itself.

## Short description (132 chars max)

> Clean, readable printouts of web articles. Two clicks: extract the
> article, reflow it, print. All local — nothing collected.

(129 characters.)

## Detailed description

> **Print the article, not the ads.**
>
> Chrome's built-in print often clips text at the page edges and lets ads,
> cookie banners, and sticky headers land on top of the article.
> NerdPerfect Printer extracts just the article — title, byline, text, and images —
> and reflows it into a clean single-column layout that prints properly.
>
> **Two clicks, done:**
> 1. Click the NerdPerfect Printer icon. A live preview shows exactly what will
>    print, with page breaks marked.
> 2. Click "Print all" — or "Print first sheet" to fit the article onto a
>    single sheet of paper (both sides on a double-sided printer, one side
>    otherwise). The normal system print dialog opens; confirm and you're
>    done.
>
> **Features**
> - Live print preview with adjustable font size (6–36 pt)
> - Keep the site's own font, or switch to a clean serif
> - "Print first sheet" trims the article to exactly one sheet of paper,
>   ending with … and the source URL
> - Select text first and NerdPerfect Printer prints exactly your selection
> - Comments are excluded from article printouts (optional "Print
>   comments" setting appends them)
> - Dark-mode sites print black-on-white
> - Images included, scaled to the page, never split across pages
> - Source URL and date printed at the end
> - Right-click menu: "Print page / selection with NerdPerfect Printer"
>
> **Private by design**
> - Everything runs locally in your browser
> - No account, no sign-in, no AI, no cloud
> - No analytics, no network requests
> - Stores only your five display preferences (font size, serif toggle,
>   paper size, double-sided flag, print-comments flag) — never any page
>   content, URLs, or history
>
> Article extraction is powered by Mozilla's open-source Readability
> (the Firefox Reader View engine).
>
> Provided free and as-is, with no support offered.

## Privacy-practices justifications (per permission)

- **activeTab** — Grants temporary access to the page the user explicitly
  invokes NerdPerfect Printer on (toolbar click or context menu), so the article
  content can be read for printing. Access ends with the action; no
  content is retained.

- **scripting** — Injects the extraction script (Mozilla Readability) into
  the current page, only at the moment the user invokes NerdPerfect Printer, to
  read the article for printing. Nothing is injected automatically or on
  other pages.

- **contextMenus** — Adds the "Print page with NerdPerfect Printer" and
  "Print selection with NerdPerfect Printer" right-click items, a
  secondary way to invoke printing.

- **storage** — Stores exactly five user preferences: font size, the
  serif-font toggle, paper size, the double-sided-printer flag, and the
  print-comments flag (chrome.storage.sync). No page content, browsing
  data, or history is ever stored.

- **Host permissions** — None requested.

- **Remote code** — None. All code ships in the package; the extension
  makes no network requests.

- **Data collection disclosure** — No user data is collected or
  transmitted. All processing is local.

## Category / misc

- Publisher: nerdfever.com (set as the developer display name in the
  Chrome Web Store dashboard; shows publicly as "offered by nerdfever.com")
- Homepage URL: https://nerdfever.com/introducing-the-nerdperfect-printer/
- Category: Productivity (or Tools)
- Language: English
- Pricing: Free
- Support: none offered (state in listing: "Provided as-is; no support")
