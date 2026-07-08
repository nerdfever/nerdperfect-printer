// NerdPerfect Printer — background.js
// Original author: Claude Fable 5, 2026-07-07
//
// MV3 service worker. Two jobs:
//   1. Register the context-menu items.
//   2. Kick off printing. The printout renders inside the article's own
//      tab (spPrintInTab / spPrintInPage in shared.js) so Chrome's print
//      header/footer shows the real page title and URL. Page content is
//      never persisted anywhere.

"use strict";

importScripts("shared.js");


// ---------------------------------------------------------------------------
// Context menus
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  // Recreate from scratch so updates never duplicate entries.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "smart-print-page",
      title: "Print page with NerdPerfect Printer",
      contexts: ["page"],
    });

    chrome.contextMenus.create({
      id: "smart-print-selection",
      title: "Print selection with NerdPerfect Printer",
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  // Which extraction the user asked for.
  const mode = info.menuItemId === "smart-print-selection" ? "selection" : "article";

  try {
    // Extract from the page (context-menu clicks grant activeTab).
    const payload = await spExtractFromTab(tab.id, mode);
    if (!payload) return;

    // Print directly with the saved preferences — the fast path.
    const settings = await spLoadSettings();
    await spPrintInTab(tab.id, payload, settings, null);
  } catch (e) {
    // Restricted page (chrome:// etc.) — nothing an extension can do.
  }
});


// ---------------------------------------------------------------------------
// Popup → print relay (the popup closes as soon as printing starts, so it
// hands the job here; the worker stays alive to run the injection)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "print-in-page") {
    spPrintInTab(msg.tabId, msg.payload, msg.settings, msg.contentHtml);
    sendResponse(true);
  }

  return false;
});
