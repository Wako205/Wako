// Load-time measurements (not part of the test suite; run with `node tests/perf/measure.js`).
//
// The site, the CDN files and a mock of the backend are served from three local servers, each on its own
// loopback address as on the real site (GitHub Pages, jsDelivr, Apps Script). Every response goes through
// one shared link shaper (latency per request, download bandwidth shared by all responses), so traffic of
// the service worker is shaped and counted like the page's. The browser is Chromium with the iPhone 13
// profile; it cannot resolve any host name, so nothing leaves the machine. The real backend is never called.
//
// Each run has two opens in one browser profile:
//   first open:  empty cache, log in with "Stay logged in", wait;
//   second open: the next day (cached files expired, so they are revalidated), kept session.
// Kind "startup": nothing is tapped after login; requests and bytes are counted for WINDOW_S seconds.
// Kind "listen":  "Listen" is tapped 2 s after the library appears; times to library and to audio playing.
//
// Usage: node tests/perf/measure.js [--profile=4g|slow4g] [--runs=3] [--kind=startup,listen] [--out=file.json]
// Assumptions (see docs/AUDIT_2026-10.md): every backend call takes BACKEND_MS on the server; its JSON is
// sent gzip-compressed; an audio part is PART_SECONDS of speech at 48 kbit/s; a chapter has PARTS parts.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const { chromium, devices } = require('@playwright/test');
const { MockBackend } = require('../support/backend');
const { NM } = require('../support/media');

const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const PROFILES = {
  '4g': { name: 'Regular 4G (4 Mbit/s down, 20 ms RTT)', bps: 4e6, rtt: 20 },
  slow4g: { name: 'Slow 4G (1.6 Mbit/s down, 150 ms RTT)', bps: 1.6e6, rtt: 150 },
};
const PROFILE = PROFILES[arg('profile', '4g')];
const RUNS = Number(arg('runs', 3));
const KINDS = arg('kind', 'startup,listen').split(',');
const BACKEND_MS = Number(arg('backend-ms', 800));
const PART_SECONDS = 120, PARTS = 8, WINDOW_S = Number(arg('window', 30));
// Experiments, to estimate a change before making it: nomusic (no lofi song is served), part0first (part 0
// is requested together with the texts, before the other parts), noprecache (sw.js does not precache the CDN files).
const EXP = arg('exp', '').split(',').filter(Boolean);

// ---------------------------------------------------------------------------
// Link shaper: one queue for the whole download bandwidth, plus one RTT before each response.
// ---------------------------------------------------------------------------
let linkFree = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
async function shapedSend(res, status, headers, body) {
  await wait(PROFILE.rtt);
  res.writeHead(status, headers);
  const CH = 8192;
  for (let i = 0; i < body.length; i += CH) {
    const chunk = body.subarray(i, i + CH), now = Date.now();
    const start = Math.max(now, linkFree);
    linkFree = start + chunk.length * 8 / PROFILE.bps * 1000;
    await wait(linkFree - now);
    if (!res.write(chunk)) await new Promise((r) => res.once('drain', r));
  }
  res.end();
}

// ---------------------------------------------------------------------------
// Request log
// ---------------------------------------------------------------------------
let log = [];
function category(host, url, action) {
  if (host === 'backend') return 'backend:' + action;
  if (host === 'cdn') return 'cdn';
  if (/music\/lofi\/.*\.mp3/.test(url)) return 'music';
  if (/tracks\.json/.test(url)) return 'music';
  return 'site';
}
function record(host, req, status, bytes, t0, action) {
  log.push({ host, url: req.url, method: req.method, status, bytes: bytes + 300, t0, t1: Date.now(), cat: category(host, req.url, action) });
}

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------
let expired = false;                         // second open: cached site files are stale and revalidated
const gz = new Map();
function gzipOf(key, buf) { if (!gz.has(key)) gz.set(key, zlib.gzipSync(buf, { level: 6 })); return gz.get(key); }
const etagOf = (buf) => '"' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16) + '"';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.bcmap': 'application/octet-stream' };
const COMPRESS = /text|javascript|json|svg|manifest/;

async function serveFile(host, req, res, buf, type, cache) {
  const t0 = Date.now(), etag = etagOf(buf);
  const h = { 'content-type': type, 'cache-control': cache, etag, 'access-control-allow-origin': '*' };
  if (req.headers['if-none-match'] === etag) { await shapedSend(res, 304, h, Buffer.alloc(0)); return record(host, req, 304, 0, t0); }
  let body = buf;
  if (COMPRESS.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) { body = gzipOf(host + req.url, buf); h['content-encoding'] = 'gzip'; }
  h['content-length'] = body.length;
  await shapedSend(res, 200, h, body);
  record(host, req, 200, body.length, t0);
}

function startServer(ip, handler) {
  return new Promise((r) => { const s = http.createServer(handler); s.keepAliveTimeout = 60000; s.listen(0, ip, () => r(s)); });
}

async function main() {
  const big = noiseMp3(PART_SECONDS);           // like speech, it does not compress
  const backend = new MockBackend();
  backend.mp3 = big;
  const perfBook = { id: 'perf1', kind: 'book', title: 'Measure Book', created: '2026-10-01T10:00:00Z', state: 'done', voice: 'Kore', lang: 'en-US', chars: 3 * PARTS * 1800, pdf: true,
    chapters: [0, 1, 2].map((c) => ({ title: 'Chapter ' + (c + 1), n: PARTS, chars: PARTS * 1800, status: 'done', voice: 'Kore' })), pos: null, marks: {} };
  const sentence = (c, k, i) => 'Sentence ' + (i + 1) + ' of part ' + (k + 1) + ' in chapter ' + (c + 1) + ' tells the story a little further.';
  backend.on('audio_text', (b) => ({ texts: Array.from({ length: backend.item(b.id).chapters[b.chapter].n }, (x, k) => Array.from({ length: 60 }, (y, i) => sentence(b.chapter, k, i)).join(' ')) }));

  const site = await startServer('127.0.0.1', async (req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/Wako\//, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory() || /node_modules|\.git/.test(rel)) { res.writeHead(404); res.end(); return record('site', req, 404, 0, Date.now()); }
    let buf = fs.readFileSync(file);
    if (rel === 'index.html' || rel === 'sw.js') buf = Buffer.from(rewrite(buf.toString('utf8'), rel === 'index.html'));
    if (EXP.includes('nomusic') && /music\/lofi\/.*\.mp3$/.test(rel)) { res.writeHead(404); res.end(); return record('site', req, 404, 0, Date.now()); }
    // GitHub Pages: 10 minutes; the second open is "the next day", so its copies are stale and revalidated.
    await serveFile('site', req, res, buf, TYPES[path.extname(rel)] || 'application/octet-stream', expired ? 'max-age=0' : 'max-age=600');
  });
  const cdn = await startServer('127.0.0.3', async (req, res) => {
    const m = req.url.match(/^\/npm\/((?:@[^/]+\/)?[^/@]+)@([^/]+)\/(.+)$/);
    const dir = m && pkgDir(m[1], m[2]), file = dir && path.join(dir, m[3]);
    if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return record('cdn', req, 404, 0, Date.now()); }
    await serveFile('cdn', req, res, fs.readFileSync(file), 'application/javascript; charset=utf-8', 'public, max-age=31536000, immutable');
  });
  const api = await startServer('127.0.0.2', (req, res) => {
    const t0 = Date.now(); let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', async () => {
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*' }); return res.end(); }
      let body = {}; try { body = JSON.parse(raw || '{}'); } catch (e) {}
      const r = body.action === 'login' ? { token: backend.token, username: body.username } : await backend.reply(body);
      await wait(BACKEND_MS);
      const json = Buffer.from(JSON.stringify(Object.assign({ ok: true }, r)));
      const out = zlib.gzipSync(json, { level: 6 });
      await shapedSend(res, 200, { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-length': out.length, 'access-control-allow-origin': '*', 'cache-control': 'no-store' }, out);
      record('backend', req, 200, out.length, t0, body.action);
    });
  });
  const SITE = 'http://127.0.0.1:' + site.address().port + '/Wako/';
  const CDN = 'http://127.0.0.3:' + cdn.address().port + '/npm/';
  const API = 'http://127.0.0.2:' + api.address().port + '/exec';
  function rewrite(s, page) {
    if (EXP.includes('noprecache')) s = s.replace('await Promise.all(CDN.map(', 'if (0) await Promise.all(CDN.map(');
    if (EXP.includes('part0first') && page) {
      const a = 'texts = await chapterTexts(P.item, c);\n      bufs = new Array(ch.n);';
      const b = 'let next = 0;\n    const it = P.item, total';
      if (!s.includes(a) || !s.includes(b)) throw new Error('part0first: the code has changed');
      s = s.replace(a, "let pre0 = null; texts = await Promise.all([chapterTexts(P.item, c), partWithRetry({ action: 'audio_part', token, id, chapter: c, index: 0, ...from }).then((d) => { pre0 = d.bytes; }, () => {})]).then((r) => r[0]);\n      bufs = new Array(ch.n); if (pre0) bufs[0] = pre0;")
        .replace(b, 'let next = bufs[0] && stop ? 1 : 0;\n    if (next === 1 && job.early && !st.earlyDone && ch.n > 1) { st.earlyDone = true; job.early(chapterData(texts, bufs, 1)); }\n    const it = P.item, total');
    }
    return s.replace(/https:\/\/cdn\.jsdelivr\.net\/npm\//g, CDN)
      .replace(/const BACKEND_URL = '[^']*'/, "const BACKEND_URL = '" + API + "'")
      .replace(/https:\/\/wako205\.github\.io\/Wako\//g, SITE);
  }

  const results = [];
  for (let run = 1; run <= RUNS; run++) {
    for (const kind of KINDS) {
      backend.library = [perfBook].concat(backend.library.filter((x) => x.id !== 'perf1'));
      perfBook.pos = null;
      const r = await oneRun(kind, SITE, backend);
      r.run = run; results.push(r);
      console.log(JSON.stringify(r));
    }
  }
  const out = arg('out', path.join(__dirname, 'results.json'));
  fs.writeFileSync(out, JSON.stringify({ profile: PROFILE, experiments: EXP, backendMs: BACKEND_MS, partSeconds: PART_SECONDS, parts: PARTS, windowS: WINDOW_S, date: new Date().toISOString(), results }, null, 1));
  console.log(summary(results));
  site.close(); cdn.close(); api.close();
}

/** MP3 of `seconds` of noise bursts (1.6 s) and pauses (0.4 s), 24 kHz mono 48 kbit/s like the server's speech. */
function noiseMp3(seconds) {
  const vm = require('vm'), ctx = {};
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(NM, 'lamejs/lame.min.js'), 'utf8'), ctx);
  const sr = 24000, enc = new ctx.lamejs.Mp3Encoder(1, sr, 48), pcm = new Int16Array(sr * seconds);
  let x = 1;
  for (let i = 0; i < pcm.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; if ((i / sr) % 2 < 1.6) pcm[i] = (x % 12000) - 6000; }
  const out = [];
  for (let i = 0; i < pcm.length; i += 11520) { const b = enc.encodeBuffer(pcm.subarray(i, i + 11520)); if (b.length) out.push(Buffer.from(b)); }
  out.push(Buffer.from(enc.flush()));
  return Buffer.concat(out);
}

let pkgs = null;
function pkgDir(name, ver) {
  if (!pkgs) {
    pkgs = {};
    const add = (d) => { try { const p = JSON.parse(fs.readFileSync(path.join(d, 'package.json'))); pkgs[p.name + '@' + p.version] = pkgs[p.name + '@' + p.version] || d; } catch (e) {} };
    for (const d of fs.readdirSync(NM)) d.startsWith('@') ? fs.readdirSync(path.join(NM, d)).forEach((x) => add(path.join(NM, d, x))) : add(path.join(NM, d));
  }
  return pkgs[name + '@' + ver];
}

// Marks in the page: when the login form works, when the first library row appears, when the narration can play.
const INSTRUMENT = () => {
  window.__m = {};
  const mark = () => {
    if (!window.__m.lib && document.querySelector('#library .libitem')) window.__m.lib = performance.now();
  };
  new MutationObserver(mark).observe(document, { subtree: true, childList: true });
  document.addEventListener('DOMContentLoaded', () => { window.__m.form = performance.now(); mark(); });   // the login form works from here
  // "Listen" opens the player without starting it: the audio counts as ready when the player can play it.
  document.addEventListener('canplay', (e) => { if (e.target && e.target.id === 'player') window.__m.playing = window.__m.playing || performance.now(); }, true);
};

async function openPage(ctx, SITE) {
  const page = await ctx.newPage();
  if (process.env.PERF_DEBUG) { page.on('pageerror', (e) => console.error('pageerror', e.message)); page.on('console', (m) => console.error('console', m.text())); }
  const tNav = Date.now();
  await page.goto(SITE, { waitUntil: 'commit' });
  return { page, tNav };
}
const pageMs = async (page, key) => page.evaluate((k) => window.__m[k] || null, key);

function counts(entries) {
  const by = {};
  entries.forEach((e) => {
    const k = e.cat.startsWith('backend:') ? 'backend' : e.cat;
    by[k] = by[k] || { requests: 0, bytes: 0 };
    by[k].requests++; by[k].bytes += e.bytes;
  });
  const total = entries.reduce((n, e) => n + e.bytes, 0);
  return { requests: entries.length, bytes: total, by, actions: entries.filter((e) => e.cat.startsWith('backend:')).map((e) => e.cat.slice(8)) };
}

async function oneRun(kind, SITE, backend) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wako-perf-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    ...devices['iPhone 13'],
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE 127.0.0.2, EXCLUDE 127.0.0.3', '--autoplay-policy=no-user-gesture-required', '--no-proxy-server'],
  });
  await ctx.addInitScript(INSTRUMENT);
  const r = { kind };
  try {
    // First open: empty cache, log in.
    expired = false; log = []; linkFree = 0;
    let { page, tNav } = await openPage(ctx, SITE);
    await page.waitForFunction(() => window.__m.form);
    r.firstForm = await pageMs(page, 'form');
    await page.fill('#user', 'tester'); await page.fill('#pass', 'secret'); await page.check('#keepLogin');
    const tLogin = await page.evaluate(() => { const t = performance.now(); document.getElementById('loginBtn').click(); return t; });
    await page.waitForSelector('#library .libitem', { timeout: 60000 });
    r.firstLibAfterLogin = (await pageMs(page, 'lib')) - tLogin;
    if (kind === 'startup') {
      await wait(WINDOW_S * 1000 - (Date.now() - tNav));
      r.first = counts(log.filter((e) => e.t0 - tNav <= WINDOW_S * 1000));
    } else {
      await wait(2000);
      r.firstStartupBeforeListen = counts(log.slice());
      const tClick = await page.evaluate(() => { const t = performance.now(); document.querySelector('#library .libitem .libacts button').click(); return t; });
      await page.waitForFunction(() => window.__m.playing, null, { timeout: 120000 });
      r.firstAudio = (await pageMs(page, 'playing')) - tClick;
      r.firstAudioRequests = log.filter((e) => e.t0 >= tNav + tClick).map((e) => e.cat + ' ' + e.bytes);
      // Until the chapter is complete and kept as a recent copy (needed for the second open).
      await waitForAsync(() => page.evaluate(() => recentIndex.size > 0), 180000);
      r.firstChapterComplete = Date.now() - tNav;
      await page.click('#pClose');
    }
    await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready).catch(() => {});
    await wait(1500);
    await page.close();
    await wait(PROFILE.rtt + 500);

    // Second open: the next day.
    expired = true; log = []; linkFree = 0;
    ({ page, tNav } = await openPage(ctx, SITE));
    await page.waitForSelector('#library .libitem', { timeout: 60000 });
    r.secondLib = await pageMs(page, 'lib');
    const lib = await waitFor(() => log.find((e) => e.cat === 'backend:audio_library'), 60000);
    r.secondLibFresh = lib ? lib.t1 - tNav : null;
    if (kind === 'startup') {
      await wait(WINDOW_S * 1000 - (Date.now() - tNav));
      r.second = counts(log.filter((e) => e.t0 - tNav <= WINDOW_S * 1000));
    } else {
      await wait(2000);
      const tClick = await page.evaluate(() => { window.__m.playing = 0; const t = performance.now(); document.querySelector('#library .libitem .libacts button').click(); return t; });
      await page.waitForFunction(() => window.__m.playing, null, { timeout: 120000 });
      r.secondAudioRecent = (await pageMs(page, 'playing')) - tClick;
      r.secondAudioRecentRequests = log.filter((e) => e.t0 >= tNav + tClick).map((e) => e.cat + ' ' + e.bytes);
      // A chapter that has not been played on this device yet.
      await wait(1000);
      const t2 = await page.evaluate(() => { window.__m.playing = 0; const s = document.getElementById('pChapter'); s.value = '2'; const t = performance.now(); s.dispatchEvent(new Event('change')); return t; });
      await page.waitForFunction(() => window.__m.playing, null, { timeout: 120000 });
      r.secondAudioNew = (await pageMs(page, 'playing')) - t2;
    }
    await page.close();
  } catch (e) {
    const pg = ctx.pages()[ctx.pages().length - 1];
    if (pg) console.error('state:', await pg.evaluate(() => ({ login: document.getElementById('loginStatus').textContent, app: !document.getElementById('appView').classList.contains('hidden'), online: navigator.onLine, status: document.getElementById('pStatus').textContent, lib: document.getElementById('library').textContent.slice(0, 200), player: { src: !!document.getElementById('player').src, rs: document.getElementById('player').readyState, err: document.getElementById('player').error && document.getElementById('player').error.message }, m: window.__m })).catch((x) => x.message));
    console.error('log:', log.map((x) => x.cat + ' ' + x.status + ' ' + x.bytes).join('\n'));
    throw e;
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return r;
}
async function waitForAsync(fn, ms) { const end = Date.now() + ms; for (;;) { if (await fn()) return true; if (Date.now() > end) throw new Error('timed out'); await wait(500); } }
async function waitFor(fn, ms) { const end = Date.now() + ms; for (;;) { const v = fn(); if (v || Date.now() > end) return v; await wait(100); } }

const med = (xs) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
function summary(results) {
  const s = (k, kind) => med(results.filter((r) => r.kind === kind).map((r) => (typeof k === 'function' ? k(r) : r[k])));
  const ms = (v) => (v == null ? '-' : (v / 1000).toFixed(2) + ' s');
  const kb = (v) => (v == null ? '-' : (v / 1e6).toFixed(2) + ' MB');
  const lines = ['Profile: ' + PROFILE.name + ', backend ' + BACKEND_MS + ' ms per call, median of ' + RUNS + ' runs' + (EXP.length ? ', experiments: ' + EXP.join(', ') : ''), ''];
  lines.push('| | first open | second open |', '|---|---|---|');
  lines.push('| Login form shown | ' + ms(s('firstForm', 'listen')) + ' | (kept session) |');
  lines.push('| Library shown | ' + ms(s('firstLibAfterLogin', 'listen')) + ' after tapping Log in | ' + ms(s('secondLib', 'listen')) + ' after opening (fresh list ' + ms(s('secondLibFresh', 'listen')) + ') |');
  lines.push('| First audio playing after tapping Listen | ' + ms(s('firstAudio', 'listen')) + ' | ' + ms(s('secondAudioRecent', 'listen')) + ' (played before), ' + ms(s('secondAudioNew', 'listen')) + ' (not played before) |');
  lines.push('| Downloaded in the first ' + WINDOW_S + ' s | ' + kb(s((r) => r.first && r.first.bytes, 'startup')) + ' | ' + kb(s((r) => r.second && r.second.bytes, 'startup')) + ' |');
  lines.push('| Requests in the first ' + WINDOW_S + ' s | ' + s((r) => r.first && r.first.requests, 'startup') + ' | ' + s((r) => r.second && r.second.requests, 'startup') + ' |');
  const ex = results.find((r) => r.kind === 'startup');
  if (ex) ['first', 'second'].forEach((k) => lines.push('', k + ' open, by kind: ' + Object.entries(ex[k].by).map(([c, v]) => c + ' ' + v.requests + ' req ' + kb(v.bytes)).join(', ') + '; backend: ' + ex[k].actions.join(' ')));
  return lines.join('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
