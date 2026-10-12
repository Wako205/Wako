// Mock of the Apps Script backend (contract: docs/API.md) and the shared test fixture.
// Every test gets a `backend` that answers requests to script.google.com, serves the
// CDN libraries from node_modules and aborts anything else.
const fs = require('fs');
const path = require('path');
const base = require('@playwright/test');
const { makeMp3, NM } = require('./media');

const INDEX_URL = 'file://' + path.resolve(__dirname, '..', '..', 'index.html');
const CHUNK = 4 * 1024 * 1024;

/** Maps a jsDelivr or unpkg npm URL (exact version) to the same file of the installed package. */
function cdnFile(url) {
  const u = new URL(url);
  const m = (u.hostname === 'cdn.jsdelivr.net' ? u.pathname.replace(/^\/npm\//, '/') : u.hostname === 'unpkg.com' ? u.pathname : '')
    .match(/^\/((?:@[^/]+\/)?[^/@]+)@([^/]+)\/(.+)$/);
  if (!m) return null;
  const dir = installed()[m[1] + '@' + m[2]];
  return dir ? path.join(dir, m[3]) : null;
}

/** name@version -> directory of every package in node_modules, including aliases such as pdfjs-dist-v3. */
let pkgIndex = null;
function installed() {
  if (pkgIndex) return pkgIndex;
  pkgIndex = {};
  const add = (dir) => {
    try { const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'))); pkgIndex[p.name + '@' + p.version] = pkgIndex[p.name + '@' + p.version] || dir; } catch (e) {}
  };
  for (const d of fs.readdirSync(NM)) {
    if (d.startsWith('@')) fs.readdirSync(path.join(NM, d)).forEach((x) => add(path.join(NM, d, x)));
    else add(path.join(NM, d));
  }
  return pkgIndex;
}

// Text of each audio segment, one sentence per tone burst of the test MP3.
const SEG_TEXTS = [
  ['The first sentence opens the chapter.', 'A second sentence follows it.', 'The third sentence ends the first part.'],
  ['The second part begins here.', 'It also has a middle sentence.', 'And this sentence closes the chapter.'],
];

/** Library as the server returns it (see the "Library item" shape in docs/API.md). */
function defaultLibrary() {
  return [
    {
      id: 'book1', kind: 'book', title: 'The Quiet Mill', created: '2026-09-01T10:00:00Z', state: 'done', voice: 'Kore', lang: 'en-US', chars: 4200, pdf: true,
      chapters: [
        { title: 'Chapter 1', n: 2, chars: 1400, status: 'done', voice: 'Kore' },
        { title: 'Chapter 2', n: 2, chars: 1400, status: 'done', voice: 'Kore' },
        { title: 'Chapter 3', n: 0, chars: 1400, status: 'none' },
      ],
      pos: null, marks: {},
    },
    {
      id: 'paper1', kind: 'paper', title: 'Phonons in MoS2', created: '2026-08-15T09:00:00Z', state: 'done', voice: 'Charon', lang: 'en-US', chars: 2600,
      chapters: [{ title: 'Phonons in MoS2', n: 2, chars: 2600, status: 'done' }],
      pos: { c: 0, t: 1.5, at: 1, label: 'A second sentence' }, marks: {},
    },
  ];
}

class MockBackend {
  constructor() {
    this.calls = [];            // every request body, in order
    this.unexpected = [];       // URLs that were neither the backend nor a known CDN file
    this.library = defaultLibrary();
    this.handlers = {};
    this.mp3 = makeMp3();
    this.token = 'tok-test';
  }
  /** Overrides the reply for one action: fn(body) returns the reply object (ok is added). */
  on(action, fn) { this.handlers[action] = fn; }
  callsOf(action) { return this.calls.filter((c) => c.action === action); }
  item(id) { return this.library.find((x) => x.id === id); }

  reply(body) {
    if (this.handlers[body.action]) return this.handlers[body.action](body);
    if (body.action !== 'login' && body.token !== this.token) return { ok: false, error: 'Session expired. Please log in again.' };
    switch (body.action) {
      case 'audio_library': return { items: JSON.parse(JSON.stringify(this.library)), ttsUsed: 120000, ttsCap: 1030000 };
      case 'audio_text': return { texts: SEG_TEXTS.slice(0, this.item(body.id).chapters[body.chapter].n).map((s) => s.join(' ')) };
      case 'audio_part': return { data: this.mp3.toString('base64') };
      case 'audio_progress': {
        const it = this.item(body.id), m = { c: body.chapter, t: body.time, at: Date.now(), label: body.label };
        if (!it) return {};                                  // an item another account shared
        if (body.slot && body.slot !== 'last') it.marks[body.slot] = m; else it.pos = m;
        return {};
      }
      case 'audio_start': return { id: 'new1', jobId: 'job-new1' };
      case 'pdf_upload': return { done: body.index === Math.ceil(body.size / CHUNK) - 1 };
      case 'audio_add': return { id: body.id, jobId: 'job-add' };
      case 'audio_delete': this.library = this.library.filter((x) => x.id !== body.id); return {};
      case 'audio_share': { const it = this.item(body.id); if (body.shared) it.shared = Date.now(); else delete it.shared; return { shared: !!body.shared }; }
      case 'translate_usage': return { ready: true, used: this.trUsed || 0, cap: 2000000 };
      case 'translate': {
        this.trUsed = (this.trUsed || 0) + body.paras.join('').length;
        return { translations: body.paras.map((p) => '[' + body.to + '] ' + p), detected: body.paras.map(() => 'en'), used: this.trUsed, cap: 2000000 };
      }
      case 'audio_rename': { this.item(body.id).title = body.title; return { title: body.title }; }
      case 'audio_public': return { items: JSON.parse(JSON.stringify(this.shared || [])) };
      case 'audio_chapter_delete': {
        const ch = this.item(body.id).chapters[body.chapter];
        if (!ch || ch.status !== 'done') return { ok: false, error: 'This chapter has no audio' };
        ch.status = 'none'; ch.n = 0; return {};
      }
      case 'audio_preview': return { data: this.mp3.toString('base64'), lang: 'en-US', chars: body.text.length };
      case 'audio_voices': return { voices: [] };
      case 'audio_outline': return { chapters: [] };
      case 'status': return { state: 'done', progress: '' };
      default: return { ok: false, error: 'Unknown action ' + body.action };
    }
  }

  /** Installs the mocks on a page, or on a browser context (needed to answer a service worker too). */
  async attach(page) {
    // Anything not handled below: CDN files from node_modules, the page itself from disk, everything else aborted.
    await page.route('**/*', async (route) => {
      const url = route.request().url();
      if (/^(file|data|blob):|^http:\/\/127\.0\.0\.1[:/]/.test(url)) return route.continue();      // the page, and the local test server
      // The site's own files that the page fetches by the published address (the built-in lofi library).
      const site = url.match(/^https:\/\/wako205\.github\.io\/Wako\/((?:music\/lofi|pdfjs\/cmaps)\/[^?#]+)/);
      if (site) {
        const f = path.join(__dirname, '..', '..', decodeURIComponent(site[1]));
        const type = f.endsWith('.json') ? 'application/json' : f.endsWith('.bcmap') ? 'application/octet-stream' : 'audio/mpeg';
        if (fs.existsSync(f)) return route.fulfill({ status: 200, path: f, headers: { 'content-type': type, 'access-control-allow-origin': '*' } });
      }
      const file = cdnFile(url);
      if (file && fs.existsSync(file)) {
        return route.fulfill({ status: 200, path: file, headers: { 'content-type': 'application/javascript; charset=utf-8', 'access-control-allow-origin': '*' } });
      }
      this.unexpected.push(url);
      return route.abort();
    });
    await page.route('**/script.google.com/**', async (route) => {
      let body = {};
      try { body = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
      this.calls.push(body);
      let r;
      if (body.action === 'login') {
        r = body.password === 'secret' ? { token: this.token, username: body.username } : { ok: false, error: 'Wrong username or password.' };
        if (this.handlers.login) r = this.handlers.login(body);
      } else r = await this.reply(body);   // a handler may return a promise (slow replies)
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(Object.assign({ ok: true }, r)) });
    });
    // sendBeacon (used on pagehide) is replaced by a fetch so the mock sees it too.
    await page.addInitScript(() => {
      navigator.sendBeacon = (url, data) => { fetch(url, { method: 'POST', body: data, keepalive: true }).catch(() => {}); return true; };
    });
  }
}

const test = base.test.extend({
  backend: async ({ page }, use) => {
    const b = new MockBackend();
    await b.attach(page);
    await use(b);
    base.expect(b.unexpected, 'requests outside the mocks').toEqual([]);
  },
});

/** Opens the page and logs in through the form. */
async function login(page, user = 'tester') {
  await page.goto(INDEX_URL);
  await page.fill('#user', user);
  await page.fill('#pass', 'secret');
  await page.click('#loginBtn');
  await base.expect(page.locator('#appView')).toBeVisible();
}

/** Opens the Audio tab and waits for the library. */
async function openAudio(page) {
  await page.click('#tabAudio');
  await base.expect(page.locator('#library .libitem').first()).toBeVisible();
}

module.exports = { test, expect: base.expect, login, openAudio, INDEX_URL, CHUNK, SEG_TEXTS, MockBackend };
