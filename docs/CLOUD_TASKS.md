# Tasks for the cloud session

Repository: Wako205/Wako. The whole site is `index.html` (no build step), published by GitHub Pages from `main`. The backend contract is in `docs/API.md`; the backend code is not here and must not be changed from this session.

Ground rules
- Never call the real backend (it spends money and touches real user data). Mock it, as described in task 4.
- No secrets, keys or passwords in the repository.
- Writing style in the UI: formal and concise; never use em dashes.
- The default theme stays white (白天); 黑夜 and 护眼 remain selectable.
- Work on a branch and open one pull request per task.

## 1. Listen with the phone locked
Make playback continue when the screen is locked or the browser is in the background (iOS Safari and Android Chrome), with lock-screen controls.
- Use the Media Session API: title, chapter, play/pause, previous/next segment, seek.
- Today segments are fetched and played one after another; make sure the next segment is already loaded before the current one ends, so playback does not stop in the background.
- Check that the Web Audio loudness chain does not block background playback on iOS; if it does, fall back to the plain audio element when the page is hidden.

## 2. Pronunciation list for technical terms
Let the user keep a list of terms with how they should be spoken (for example "MoS2" read as "M O S two", "CVD" letter by letter).
- UI: a small editor in the Audio tab (term, spoken form), stored per user. Until a backend action exists, keep it in localStorage and say so in the UI.
- Apply it to book chapters before `audio_start` and `audio_add` (the page sends their text). The displayed text in the player must keep the original spelling.
- Papers are narrated by the server, so applying the list there needs a backend change: describe the request field you need in the pull request instead of implementing it.

## 3. Phone layout
Make every tab usable at 360 to 430 px width: no horizontal scrolling, buttons at least 44 px tall, the player controls in one or two rows, the chapter list readable, and the theme switcher reachable.

## 4. Automated tests
Add a Playwright test suite (`tests/`, `package.json` with `npm test`) that loads `index.html` from disk and mocks the backend with `page.route` (pattern `**/script.google.com/**`), returning replies as in `docs/API.md`. Cover at least: login, the library list, opening a book and playing (synchronized text highlight moves), bookmarks, the three themes and their persistence, choosing chapters of a book, adding chapters later, chunked PDF upload (`pdf_upload` index order and sizes), and the phone layout at 390 px. Add a GitHub Actions workflow that runs it on every push and pull request. Serve the CDN libraries from `node_modules` in the mocks so tests do not depend on the network.

## 5. Code tidy and security review
- Split nothing into a build system; keep one `index.html`, but group the script into clearly commented sections and remove dead code.
- Review for XSS: every place that puts server or PDF text into the page must use `textContent` or sanitized HTML (DOMPurify is loaded).
- Check that the token is only kept where needed and is cleared on logout.
- Pin every CDN script to an exact version, and add Subresource Integrity hashes.
- Write findings that need a backend change into the pull request description rather than working around them.
