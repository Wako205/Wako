# Tasks for the cloud session, round 4

Repository: Wako205/Wako. The site is `index.html` (no build step), published by GitHub Pages from `main`. The backend contract is in `docs/API.md`; the backend code is not here and must not be changed from this session.

Ground rules (same as rounds 1 to 3)
- Never call the real backend. Mock it in the Playwright tests (`tests/`, `npm test`), as the existing tests do (`tests/support/backend.js`).
- No secrets, keys or passwords in the repository.
- UI text: formal and concise English; never use em dashes. Every new English string the page shows also gets its Chinese entry in the i18n dictionary at the end of `index.html` (`D`, or a rule in `R`/`F` for text with numbers); `tests/i18n.spec.js` shows how to check it.
- Themes: eye care (default, first), day, night. New UI must work in all three and at 360 to 430 px width with 44 px touch targets (`tests/phone-layout.spec.js`).
- One branch and one pull request per task, each based on the current `main`. All existing tests must keep passing (`npx playwright test --project=chromium`; `tests/offline.spec.js:314` is known to be flaky); add tests for every new behaviour.
- If a task needs a backend change, describe it in the pull request instead of working around it.
- Do not merge pull requests; report when each is ready.

Since round 3, `main` gained: tabs My library (first, opens after login: player and library), PDF to audio (conversion form and speech chart only), Chat, Translate, Admin (only for admin accounts, `admin_stats`); English interface by default with a 中文/EN switch (`#langBtn`, `mp_lang`); the library saved on the device is shown at once and refreshed in the background (`applyLibrary`, `libFetchedAt`); shared items load in parallel; the music starts after the first library load; status polls run in parallel and pause while the page is hidden; the Claude chapter search (`mp_outline_<hash>`) and voice samples (`previewCache`) are not requested twice; pausing the book with `#pPlay`/`#mPlay` also pauses the music (`togglePlay`).

## H. Library rows on phones
At 390 px a book row has up to five buttons (Listen, Offline, Add chapters, Share, Delete) and wraps to two lines; Delete sits beside Share.
- Keep Listen/Resume and Offline as buttons. Put Add chapters, Share/Unshare, Rename and Delete into one "⋯" menu button (`aria-label="More actions"`, 44 px). On wide screens (over 700 px) the buttons may stay as they are.
- Delete keeps its confirmation. The menu closes on Escape, on a tap outside and after a choice; keyboard accessible.
- Show `#offlineInfo` only when something is saved offline or the page is not running from the Home Screen.
- Update the tests that click these buttons (`tests/library.spec.js`, `tests/sharing.spec.js`, `tests/titles.spec.js`, `tests/chapter-delete.spec.js`, `tests/voices.spec.js`, `tests/offline.spec.js`) and add a 390 px layout test: one row of buttons per item.

## I. Stay logged in (opt-in)
On iPhone, every launch from the Home Screen needs a new login because the token is in `sessionStorage`.
- Add a "Stay logged in on this device" checkbox under the login form, off by default. When ticked, keep the token in `localStorage` (`mp_token_keep`) instead; Log out removes it.
- The backend token lasts 24 hours; after it expires the login form appears as now. Note in the pull request whether a longer token would be wanted (a backend change, not for this session).
- Tests: kept after a reload and a new page in the same context when ticked; not kept when not ticked; removed by Log out.

## J. Keep recently played chapters on the device
Chapters played are downloaded again in full every session (base64 `audio_part`, about 20 to 30 MB per hour of audio).
- After a chapter has played through its parts, keep it in the existing IndexedDB offline store, marked as "recent" (not as saved by the user), and play it from there next time without requests.
- Limit the recent copies to about 200 MB per user, removing the least recently played first; never remove chapters the user saved for offline. Show the recent copies in the storage line, and remove them on Log out like the other offline data.
- Tests with the mocked backend: the second play of a chapter makes no `audio_part` call; the limit removes the oldest recent chapter; user-saved chapters stay.

## K. Load the large scripts only when needed
`pdf-lib` (about 525 KB), `jszip`, `marked` and `DOMPurify` are loaded before the main script on every visit, but are needed only for paper splitting, `.docx` reading and chat Markdown.
- Load them with the existing `loadScript`/`LIB` helper (with the same Subresource Integrity hashes) at the point of use: `splitPdf*`, `readDocx`, `renderMarkdown` (render plain text until loaded, then re-render). Move the `DOMPurify.addHook` into the loader.
- Keep `sw.js` caching them so the offline page still works. Measure the first-load transfer before and after and give the numbers in the pull request.

## L. Remove hidden and dead code
- The Polish / Review tab (`#tabTools`, `#toolsView` and its handlers) is hidden. Remove it and its i18n entries; keep `exportDocx`, which chat polishing uses.
- The pronunciation box (`#pronBox`) is hidden, but saved terms are still applied silently to new conversions. Stop applying them to new conversions (`respell`), keep `unrespell` and `mp_pron_used_<id>` so books converted with a list still show the original spelling; remove the box and `renderPron`.
- The one-time `admin_stats` probe in `showApp` (for sessions from before login returned `admin`) can go.
- Report the number of lines removed.

## M. Small interface fixes
- Chat "Download .md" and "Copy" are 12 px links without `href`: make them `button.ghost.small` with 44 px targets on phones.
- Player previous/next buttons are 38 px wide: make them 44 px.
- "PDF to audio" wraps to two lines in the tab bar at 390 px (five tabs with Admin): fit all tab labels on one line at 360 px (for example "Convert" as the short label on phones, with the full name as `title`), in English and Chinese.
- A conversion whose progress text has not changed for 10 minutes: show "No progress for 10 min; the server keeps trying." in the row and poll it every 60 s instead of 8 s (the server uses the polls to restart stalled jobs, so keep polling).

## Not for this session
Backend Version 36 (retries on Claude overloads, failure limits counted per run, trigger limit handling, library cache) is prepared outside this repository and is deployed from the Apps Script editor.
