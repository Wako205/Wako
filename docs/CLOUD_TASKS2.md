# Tasks for the cloud session, round 2

Repository: Wako205/Wako. The site is `index.html` (no build step), published by GitHub Pages from `main`. The backend contract is in `docs/API.md`; the backend code is not here and must not be changed from this session.

Ground rules (same as round 1)
- Never call the real backend. Mock it in the Playwright tests (`tests/`, `npm test`), as the existing tests do.
- No secrets, keys or passwords in the repository.
- UI text: formal and concise English; never use em dashes.
- The default theme is eye care (护眼), listed first; 白天 and 黑夜 remain selectable. New UI must work in all three themes and at 360 to 430 px width with 44 px touch targets (see `tests/phone-layout.spec.js`).
- One branch and one pull request per task, each based on the current `main`. All existing tests must keep passing; add tests for every new behaviour.
- If a task needs a backend change, describe it in the pull request instead of working around it.

## A. Upgrade pdf.js to 4.x
pdf.js 3.11.174 is affected by CVE-2024-4367; the page now only sets `isEvalSupported: false` as a stopgap.
- Move to the newest 4.x release that is at least two weeks old, loaded from jsDelivr with an exact version and an `integrity` hash, like the other scripts. 4.x ships ES modules (`pdf.min.mjs`, `pdf.worker.min.mjs`), so load it with a dynamic `import()` and start the worker in a way that still checks integrity.
- Book and thesis detection depends on the text pdf.js returns (running headers, table of contents, paragraph indentation, chapter headings). Show with a test that the extracted chapters of the test PDFs are the same before and after the upgrade.
- Update the security tests (`tests/security.spec.js`) for the new files.

## B. Offline listening
Let the user keep converted chapters on the phone and listen without a connection (for example on a plane).
- In the library and in the player: "Save for offline" per chapter and per book, with the size shown before saving, a mark on saved chapters, and "Remove offline copy".
- Store the audio segments and their texts in the browser (Cache API or IndexedDB). When a chapter is saved, the player must use the stored copy and make no network request for it.
- Make the page itself open without a connection: a service worker scoped to `/Wako/` that caches `index.html` and the pinned CDN scripts. The library list shown offline is the last one received; actions that need the server are disabled with a short explanation.
- Listening positions and bookmarks saved while offline are kept and sent with `audio_progress` when the connection returns.
- Show the storage used and the space left (`navigator.storage.estimate()`), and request persistent storage (`navigator.storage.persist()`). Note in the UI that iPhone Safari may delete offline data of sites not added to the Home Screen, and how to add it.
- Logout must delete all offline copies and cached data of that user.

## C. Sleep timer
- In the player: stop after 15, 30 or 60 minutes, or at the end of the current chapter; show the time left; allow cancelling.
- Fade the volume out over the last 10 seconds, then pause and save the position.
- It must work with the screen locked and the page in the background: drive it from the audio element's `timeupdate`/`ended` events and wall-clock time, not only from `setTimeout`, which background tabs throttle.
- Remember the last choice in this browser.

## D. Search inside a book
- A search box in the player for the open item. It searches the text of every converted chapter (load the texts with `audio_text` as needed and keep them in memory for the session).
- Results list chapter title and a short snippet with the match highlighted (insert text with `textContent`, never as HTML). Clicking a result opens that chapter, jumps to the sentence and starts playing from it.
- Chinese text has no spaces: match on characters; ignore differences in white space, full-width versus half-width forms and letter case.
- Show "No results" and the number of matches; limit the list to the first 200 results.
