# Wako205 backend API

The page talks to one Google Apps Script web app (URL in `index.html`, constant `BACKEND_URL`). The backend source is not in this repository and is deployed separately; this file is the contract.

Every call is `POST` with a JSON body `{action, token, ...}` (sent as `text/plain` to avoid a CORS preflight). Every reply is JSON: `{ok: true, ...}` or `{ok: false, error}`. A reply whose error mentions "log in again" means the token expired. One request can carry at most about 50 MB.

## Account
| action | request | reply |
|---|---|---|
| `login` | `username, password` | `token, username` (at most 10 failed attempts per user name per day, Japan time) |
| `logout` | | `ok`; every token of this user issued so far stops working |

## Polish / review (async jobs)
| action | request | reply |
|---|---|---|
| `start` | `text, mode ('polish' or 'review'), filename, instructions` | `jobId` |
| `status` | `jobId` | `state, progress, result...` (poll until `state` is `done` or `error`) |
| `chat_start` | `messages, convId, preset` | `jobId, convId` |
| `chat_run` | `jobId` | job state |

## Audio (PDF to speech)
| action | request | reply |
|---|---|---|
| `audio_start` | `filename, voice, kind ('paper' or 'book')`, optional `title` (shown in the library; default: file name); paper/thesis: `parts` (base64 PDF parts), `pages`, optional `chapterTitles`; book: `chapters [{title,text}]`, `selected [indices]` | `id` (library item), `jobId` |
| `pdf_upload` | `id, size, index, data` (base64 of 4 MiB raw chunk `index`), `filename` | `done` (true after the last chunk). The server checks `size` (at most 200 MB), `index`, the chunk length, and refuses a second upload for an item that already has its PDF |
| `audio_library` | | `items, ttsUsed, ttsCap` (Google), `azReady, azUsed, azCap` (Microsoft free tier, this month), `s0Used, s0Cap` (trial credit, all accounts, in total), `s0Mine, s0UserCap` (trial credit used by this account, and its limit of 2,000,000), `azTier ('s0' while the trial resource is valid, else 'f0'), azUntil` (ms, end of the trial resource, or null) |
| `audio_text` | `id, chapter`, optional `owner` | `texts` (one string per audio segment) |
| `audio_part` | `id, chapter, index`, optional `owner` | `data` (base64 MP3 of that segment) |
| `audio_progress` | `id, chapter, time, label, slot ('last','b1','b2')`, optional `owner` | `ok` (for a shared item the position is stored for the caller only) |
| `audio_delete` | `id` | `ok` (also stops sharing it) |
| `audio_chapter_delete` | `id, chapter` (a converted chapter of a book) | `items`; the chapter becomes `status 'none'` and can be converted again |
| `audio_rename` | `id, title` | `title` (renames an item of your own library) |
| `audio_share` | `id, shared (true/false)` | `shared`; only the owner can share |
| `audio_public` | | `items`: shared items of every account, `{id, owner, mine, title, kind, created, sharedAt, state, voice, lang, chars, chapters, pos, marks}` with the caller's own `pos` and `marks` |
| `audio_add` | `id, voice, selected` (book chapters to convert next) | `id, jobId` |
| `audio_outline` | `pages, head, firsts`; for a book also `kind: 'book', cands` (short lines as "page:line text") | `chapters [{title, page}]` |
| `audio_preview` | `text` (at most 200 characters), `voice` | `data` (base64 MP3), `lang, chars` |
| `audio_voices` | `lang ('cmn-CN','ja-JP','en-US')` | `voices` |

Library item: `{id, kind, title, created, state ('processing','done','error'), voice, lang, chars, chapters [{title, n, chars, status, voice}], pos, marks {b1, b2}, jobId, pdf, shared}`.

Shared items: pass `owner` (the user name from `audio_public`) to read another account's shared item; the server refuses it once it is no longer shared. Others can only listen. Chapter `n` is the number of audio segments; segment `k` of chapter `c` plays in order.

Voices: Google Chirp 3 HD names (`Charon`, `Kore`, ...) or Microsoft Azure voices as `az:<voice name>` (for example `az:zh-CN-YunxiNeural`), accepted by `audio_start`, `audio_add` and `audio_preview`.

Spending: Google speech is capped by the server at 1,030k characters per month (Google's free tier is 1,000k); Microsoft speech uses the free F0 tier (500k a month) first; text that does not fit goes to the paid trial resource (S0, 12,000k in total) while it is valid. `audio_preview` also counts. Tests must never call the real backend.
