# My prompts — NerdPerfect Printer build session (2026-07-07)

Every prompt I gave Claude (Fable 5, in Claude Code) during the session
that built this extension, in order. Entries in *[brackets]* were answers
picked in Claude's question dialogs rather than typed; screenshots and
images I attached are noted. The initial specification (prompt 1) was
itself drafted with claude.ai beforehand.

1. The full project specification: build a Chrome extension ("Smart
   Print") from scratch — MV3-only, plain JS, no build step, vendored
   Mozilla Readability, 2-click popup UX with live preview, one-sheet
   truncation, selection printing, comment stripping, minimal permissions,
   icons, README, and Web Store listing. Working order: interview me →
   CLAUDE.md for approval → implementation plan for approval → implement.
   *(Full text omitted here — it's long; I'll quote it separately in the
   post.)*

2. *[Question-dialog answers: paper size → "Add a paper-size setting";
   hyperlinks on paper → "Underlined, no URL"]*

3. Where is it? I don't see it in the folder. I want to review it.

4. Looks great. Please do it.

5. *[Plan approval, with notes:]* Good except don't truncate one-sheet at
   a paragraph boundary (unless not doing so is difficult). Fine to print
   a partial paragraph at the end - whatever fits on the sheet. Please
   include not only serif font box, but a font size box (which if changed
   updates the preview) and a printer selection dialog (choose spefici
   printer, PDF generator) and a way to change paper size (can be thru
   standard printer dialog).

6. How to enable the Chrome integration for this session?

7. *[screenshot]* The extension is already in Chrome. Not sure why you
   can't get at it.

8. @browser

9. Can't you test it yourself?

10. formatting looks like it's clipping the right side in the preview.
    (the Windows print preview dialog looks OK). Images are not printing
    (the flag).

11. Does the dialog need a close X button? I see it closes if you click
    outside the dialog (good) but is it confusing without the X button?

12. Still not printing images.

13. Can't you test that yourself?

14. Please rename button to "Print first sheet"

15. OK; if I select a region and print images print. If I don't select,
    they don't.

16. Got a popup - "Scott Sumner wants to access..." I clicked Allow.

17. Please remove the shading and "Print 1 sheet cuts here". It's just
    clutter. Can the preview show pages instead of dashed lines at page
    breaks?

18. I didn't have to reload - I just tried it and got the new version.
    Works better now. The headers and footers that appear in the real
    print don't appear in the preview - can you fix that (I want the
    headers and footers).? I see you made a store listing draft - who is
    the credited publisher?

19. Can you make the font size a dropdown instead of a thing with
    increase/decrease arrows (whatever that's called)? And allow all
    available font sizes there. Please.

20. Let's call it Nerdprint and credit it to nerdfever.com.

21. Better yet - Nerdperfect Printer.

22. no, still didn't need a reload. Why are font sizes limited to 9..16
    point? I don't think that's ideal. Dropdown is much better. Can we
    sniff out the paper sizes suppored by the currently-selected printer
    and offer all of them in the dropdown (now just Letter and A4)?

23. *[screenshot]* ok, I think the 9..16 range came from
    https://claude.ai which wrote the first prompt for me. I hadn't
    noticed it. If we can't sniff the paper size please retitle the box
    "Print preview size:". And in the dialog, put the ext title in it
    somewhere near the top, and line up the dropboxwn boxes with the
    captions better. Please.

24. *[screenshot]* Looking better! Found a bug - see clipped text on
    page 2.

25. Can we make the ext icon a printer with nerd glasses (classic black
    frames with tape)?

26. Let's use "NerdPerfect Printer" (capitalization). I'm writing a blog
    post to link to in the store.

27. What will it do if the user has a printer that can't print double
    sided? If the answer is "print two sheets" then there needs to be a
    setting for that - I really want it to print just 1 sheet.

28. *[image: nerd with taped glasses]* Glasses should be in front of
    printer icon, in this style (not round John Lennon glasses) with tape
    more crudely applied than in this image. Glasses larger than printer;
    printer visible behind glasses.

29. *[image: Arnie from "Christine"]* Here's a good example of the
    glasses (character "Arnie" in film "Christine")

30. Can we add a checkbox "Print comments"?

31. We're getting there! Please rename "Tabloid" to 'Tabloid (11x17")',
    add 13x19" and omit Executive.

32. Let's be consistent with the paper size names: Name (dimensions),
    including for Letter. (not for ISO sizes)

33. ok, the url in the footer reads "chrome-extension..." instead of the
    source URL. Can you fix that? Note what I get when I try to print
    this Google search result - with or without "print comments" I only
    get the AI overview result.

34. Huh? "API Error: Server error mid-response. The response above may be
    incomplete."

35. *[screenshot]* Footers are good now but the font seems way too small
    and I get "Couldn't extract an article...".

36. Please also change label "Use clean serif font" to "Force <font
    name>").

37. ok, make it "Force <fontname> font" then ("Georgia" seems confusing
    by itself).

38. Let's move the Force font box to underneath the Font size selection.
    And move Print Preview Size to the same new line - that'll allow it
    to move flush right against the edge of the window (instead of being
    blocked by Double Side Printer). Just should look nice that way.

39. ok, but put DS printer and print comments on the right.

40. I put a PDF output in the folder for you to look at. It's quite good
    I think. Can we move Print Comments to the left of the Print First
    Sheet button, and move DS printer all the way right?

41. Better yet - let's position DS printer exactly under the Print First
    Sheet button (since that's what it affects).

42. I don't see any charts but I see 2 images. They look OK to me.

43. See; it's in the folder. Alas the flag image messed up the
    pagination. I got 2 sheets (3 pages).

44. Almost. Look. The appended footer.

45. *[screenshots]* Perfect. It's in the folder. Next, let's do the
    Google search page. It's bad. See screenshots too. Look in folder.

46. Preview is better (images, no text at all). PDF is still blank pages.

47. *[screenshots]* Not good. See pdf too.

48. *[screenshots]* Can we make the preview pane resizable (I'd like to
    drag it bigger to see more vertically)? Please look at the foobar
    output pdfs.

49. *[screenshot]* Preview still has problems. Postscript still spills
    one sheet to two; Print all still produces blank PDF sheets. See PDFs

50. *[screenshots]* OK, now I'm trying it on an XDA article. It could use
    some work. Compare screenshot to preview and output (I set up Claude
    Code...) I'm not sure what to do here.

51. That's a big improvement. Can we be a little smarter about font size
    in these cases - the author bio doesn't appear in the Chrome rendered
    version at all - just the first line of it appears, and that's in
    very small font in light grey - meant to be easily ignored. Can we
    maybe print that in a much smaller font? Also - can you output a list
    of my prompts in this session so far? I want to include them in my
    blog posting.
