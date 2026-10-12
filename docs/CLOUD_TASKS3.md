# Tasks for the cloud session, round 3

Repository: Wako205/Wako. The site is `index.html` (no build step), published by GitHub Pages from `main`. The backend contract is in `docs/API.md`; the backend code is not here and must not be changed from this session.

Ground rules (same as rounds 1 and 2)
- Never call the real backend. Mock it in the Playwright tests (`tests/`, `npm test`), as the existing tests do.
- No secrets, keys or passwords in the repository.
- UI text: formal and concise English; never use em dashes.
- The default theme is eye care (护眼), listed first; 白天 and 黑夜 remain selectable. New UI must work in all three themes and at 360 to 430 px width with 44 px touch targets (see `tests/phone-layout.spec.js`; the player settings row is already full at 360 px, so put new player controls elsewhere).
- One branch and one pull request per task, each based on the current `main`. All existing tests must keep passing; add tests for every new behaviour.
- If a task needs a backend change, describe it in the pull request instead of working around it.

Since round 2, `main` gained: per-chapter delete, shared library (`audio_share`, `audio_public`, `owner` on `audio_text`/`audio_part`/`audio_progress`), positions and bookmarks stored per user in the browser (`mp_pos_<user>_<id>`, `mp_mark_<slot>_<user>_<id>`), waiting for chapters still being converted at the end of a chapter, Screen Wake Lock (`#pAwake`), Microsoft voices listed first, the user name in the header (`#brand`), no volume modes and no Web Audio during playback (so it continues with the screen locked), text following always on (no `#pFollow`), the pronunciation list hidden, and the speech allowances as a column chart beside the conversion form (`#usageCard`).

## 0. Bring the round 2 pull requests up to date
PRs #6 (pdf.js 4), #7 (sleep timer), #8 (search) and #9 (offline) conflict with the new `main`. Merge `main` into each branch (merge commits, no rewriting), resolve the conflicts, and keep all tests passing. In particular:
- #9 offline: shared items have an `owner`; store and replay them with it, and key offline copies and the outbox by user. The browser keys for positions and bookmarks now include the user name.
- #9 offline: the "wait for a chapter still being converted" logic must not wait forever offline; when offline, go to the next chapter saved for offline instead.
- #7 sleep timer: "end of chapter" must also stop when the player is waiting for a chapter still being converted.
Do not merge the pull requests; report when each is ready.

## E. Background music under the narration
Optional quiet lo-fi music while listening, playing together with the speech.
- Hard requirement: playback must continue with the iPhone screen locked. iOS suspends Web Audio when the screen locks, which is why `main` removed the volume modes and plays the narration through the plain `<audio id="player">` element only. Do not route the narration through an `AudioContext`, and do not play the music through one at run time either.
- Sources:
  1. "Generated": lo-fi style music synthesized in this page (soft electric piano or pad chords on a slow progression, a gentle drum loop with swing, vinyl crackle, low-pass filtering). Render it ahead of time with an `OfflineAudioContext` into a loop of a few minutes (WAV blob), and play that blob in a second plain `<audio>` element with `loop`. A few presets (for example "Rain", "Night", "Café") that differ in tempo, key and texture; vary the loop so an hour of listening is not tiring. No audio files are downloaded, so there are no licensing questions.
  2. "My music": the user picks audio files from the device; they are kept in this browser only (IndexedDB), never uploaded, played in a loop or shuffled.
- Level: iOS ignores `HTMLMediaElement.volume`, so the level must be baked into the rendered loop (default about -20 dB below the speech level; offer three levels and re-render when the level changes). For "My music", render a copy at the chosen level with an `OfflineAudioContext` before playing it. No ducking (it cannot work on iOS without Web Audio).
- The music starts, pauses and resumes with the narration (including lock-screen controls, chapter changes and the sleep timer if merged), and never takes over the lock-screen title.
- First check whether iOS Safari and Home Screen apps play two `<audio>` elements at the same time, with the screen locked. If they do not, stop and report in the pull request before building the rest.
- Controls: a "Music" button in the player (the settings row has room again now that the volume select is gone, but check 360 px) opening a small panel with source, preset, level, on/off. Remember the choices per user in this browser.
- Test in Playwright (Chromium and WebKit) as far as possible and state in the pull request what could only be checked on a real phone.

## F. Continue listening
- After login, show at the top of the PDF to audio tab a "Continue listening" card for the item (own or shared) with the most recent position: title, chapter, time, sentence label, and one button that opens the player there.
- In the library, sort items by last listened (most recent position first), with an option to sort by date added. Remember the choice in this browser.

## G. Visual polish of the whole page
Redesign the layout and typography of `index.html` so the page looks calm, aligned and consistent. Behaviour and element ids stay the same; every existing test must keep passing (update a test only where it checks wording you removed, and say so in the pull request).
- Alignment: one grid and one spacing scale (for example 4, 8, 12, 16, 24 px) for every card, row, label and control. Labels, fields and buttons in a row share a baseline and a height; card edges, headings and lists line up on the same left edge; numbers (times, sizes, percentages) use tabular figures and right-align in lists.
- Type: at most four font sizes on the page (for example 12, 14, 16 and 20 px) and two weights; one line height for body text and one for the reading text (Chinese reading text stays large and comfortable). No text smaller than 12 px.
- Remove explanations that are not needed: shorten or delete notices and helper sentences that repeat what the controls already say (for example the long paragraph under "Generate audio", the music panel notes, repeated hints in the library rows). Keep only text a first-time user needs to act; move rare details into `title` tooltips.
- Icons and buttons: one icon style (inline SVG, same stroke width, same 16 or 20 px box, `currentColor`), used consistently for play, pause, previous, next, close, music, sleep, search, offline, share, delete. Text buttons in one row have equal height; primary, secondary (ghost) and destructive buttons each have one look. Every icon-only button has an `aria-label` and a 44 px touch target on phones.
- Keep the three themes (护眼 default and first, 白天, 黑夜) with the same tokens; check contrast (WCAG AA for text). Keep everything working at 360 to 430 px with no horizontal scrolling and 44 px targets (`tests/phone-layout.spec.js`), and at desktop widths.
- Attach before and after screenshots (desktop and 390 px, each theme for the audio tab and the open player) to the pull request.
