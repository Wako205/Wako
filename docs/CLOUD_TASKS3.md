# Tasks for the cloud session, round 3

Repository: Wako205/Wako. The site is `index.html` (no build step), published by GitHub Pages from `main`. The backend contract is in `docs/API.md`; the backend code is not here and must not be changed from this session.

Ground rules (same as rounds 1 and 2)
- Never call the real backend. Mock it in the Playwright tests (`tests/`, `npm test`), as the existing tests do.
- No secrets, keys or passwords in the repository.
- UI text: formal and concise English; never use em dashes.
- The default theme is eye care (护眼), listed first; 白天 and 黑夜 remain selectable. New UI must work in all three themes and at 360 to 430 px width with 44 px touch targets (see `tests/phone-layout.spec.js`; the player settings row is already full at 360 px, so put new player controls elsewhere).
- One branch and one pull request per task, each based on the current `main`. All existing tests must keep passing; add tests for every new behaviour.
- If a task needs a backend change, describe it in the pull request instead of working around it.

Since round 2, `main` gained: per-chapter delete, shared library (`audio_share`, `audio_public`, `owner` on `audio_text`/`audio_part`/`audio_progress`), positions and bookmarks stored per user in the browser (`mp_pos_<user>_<id>`, `mp_mark_<slot>_<user>_<id>`), waiting for chapters still being converted at the end of a chapter, Screen Wake Lock, Microsoft voices listed first, and the user name in the header (`#brand`).

## 0. Bring the round 2 pull requests up to date
PRs #6 (pdf.js 4), #7 (sleep timer), #8 (search) and #9 (offline) conflict with the new `main`. Merge `main` into each branch (merge commits, no rewriting), resolve the conflicts, and keep all tests passing. In particular:
- #9 offline: shared items have an `owner`; store and replay them with it, and key offline copies and the outbox by user. The browser keys for positions and bookmarks now include the user name.
- #9 offline: the "wait for a chapter still being converted" logic must not wait forever offline; when offline, go to the next chapter saved for offline instead.
- #7 sleep timer: "end of chapter" must also stop when the player is waiting for a chapter still being converted.
Do not merge the pull requests; report when each is ready.

## E. Background music under the narration
Optional quiet music while listening, mixed under the speech.
- Sources, in this order of priority:
  1. "Generated": lo-fi style music synthesized in the browser with the Web Audio API (soft electric piano or pad chords on a slow progression, a gentle drum loop with swing, vinyl crackle, low-pass filtering). No audio files, so no licensing questions. A few presets (for example "Rain", "Night", "Café") that differ in tempo, key and texture; endless and non-repetitive enough for an hour of listening.
  2. "My music": the user picks audio files from the device; they are kept in this browser only (IndexedDB), never uploaded, played in a loop or shuffled.
- The narration already runs through an `AudioContext` (see the volume modes around `createMediaElementSource(player)`); mix the music into the same graph so one output carries both. Music level relative to speech adjustable (default about -20 dB), and ducking: the music drops further while a sentence is being spoken and rises slightly in pauses.
- It must keep playing with the screen locked on iPhone (Safari and Home Screen app) together with the narration, and pause and resume with it (including lock-screen controls). Test this on WebKit in Playwright as far as possible and state in the pull request what could only be checked on a real phone.
- Controls: a "Music" button in the player (not in the full settings row, which has no room at 360 px) opening a small panel with source, preset, level, on/off. Remember the choices per user in this browser.
- Nothing is downloaded from third-party sites at run time.

## F. Continue listening
- After login, show at the top of the PDF to audio tab a "Continue listening" card for the item (own or shared) with the most recent position: title, chapter, time, sentence label, and one button that opens the player there.
- In the library, sort items by last listened (most recent position first), with an option to sort by date added. Remember the choice in this browser.
