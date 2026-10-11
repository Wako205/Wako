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
| `audio_start` | `filename, voice, kind ('paper' or 'book')`; paper/thesis: `parts` (base64 PDF parts), `pages`, optional `chapterTitles`; book: `chapters [{title,text}]`, `selected [indices]` | `id` (library item), `jobId` |
| `pdf_upload` | `id, size, index, data` (base64 of 4 MiB raw chunk `index`), `filename` | `done` (true after the last chunk). The server checks `size` (at most 200 MB), `index`, the chunk length, and refuses a second upload for an item that already has its PDF |
| `audio_library` | | `items, ttsUsed, ttsCap` (Google), `azReady, azUsed, azCap` (Microsoft) |
| `audio_text` | `id, chapter` | `texts` (one string per audio segment) |
| `audio_part` | `id, chapter, index` | `data` (base64 MP3 of that segment) |
| `audio_progress` | `id, chapter, time, label, slot ('last','b1','b2')` | `ok` |
| `audio_delete` | `id` | `ok` |
| `audio_add` | `id, voice, selected` (book chapters to convert next) | `id, jobId` |
| `audio_outline` | `pages, head, firsts` | `chapters [{title, page}]` |
| `audio_preview` | `text` (at most 200 characters), `voice` | `data` (base64 MP3), `lang, chars` |
| `audio_voices` | `lang ('cmn-CN','ja-JP','en-US')` | `voices` |

Library item: `{id, kind, title, created, state ('processing','done','error'), voice, lang, chars, chapters [{title, n, chars, status, voice}], pos, marks {b1, b2}, jobId, pdf}`. Chapter `n` is the number of audio segments; segment `k` of chapter `c` plays in order.

Voices: Google Chirp 3 HD names (`Charon`, `Kore`, ...) or Microsoft Azure voices as `az:<voice name>` (for example `az:zh-CN-YunxiNeural`), accepted by `audio_start`, `audio_add` and `audio_preview`.

Spending: Google speech is capped by the server at 1,030k characters per month (Google's free tier is 1,000k); Microsoft speech at 500k (the free F0 tier). `audio_preview` also counts. Tests must never call the real backend.
