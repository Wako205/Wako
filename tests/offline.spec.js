// Offline listening. These tests serve the site from a local HTTP server under /Wako/, as
// GitHub Pages does, so the service worker can run; the backend and the CDN are mocked on
// the browser context, which also answers the service worker's own requests.
const fs = require('fs');
const http = require('http');
const path = require('path');
const base = require('@playwright/test');
const { MockBackend } = require('./support/backend');

const ROOT = path.resolve(__dirname, '..');
const expect = base.expect;
const test = base.test.extend({
  site: [async ({}, use) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/Wako\//, '') || 'index.html';
      const file = path.join(ROOT, rel);
      if (!file.startsWith(ROOT) || !/^(index\.html|sw\.js|music\/lofi\/[\w.-]+)$/.test(rel) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
      const type = rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.mp3') ? 'audio/mpeg' : rel.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
      res.end(fs.readFileSync(file));
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    await use('http://127.0.0.1:' + srv.address().port + '/Wako/');
    srv.close();
  }, { scope: 'worker' }],
  backend: async ({ context }, use) => {
    const b = new MockBackend();
    await b.attach(context);
    await use(b);
    expect(b.unexpected, 'requests outside the mocks').toEqual([]);
  },
});

async function login(page, site, user = 'tester') {
  await page.goto(site);
  await page.fill('#user', user);
  await page.fill('#pass', 'secret');
  await page.click('#loginBtn');
  await expect(page.locator('#appView')).toBeVisible();
}
async function openAudio(page) {
  await page.click('#tabLib');
  await expect(page.locator('#library .libitem').first()).toBeVisible();
}
const book = (page) => page.locator('#library .libitem').first();
const paper = (page) => page.locator('#library .libitem').nth(1);
/** Saved chapters in IndexedDB: their keys, and whether audio is stored for each. */
const stored = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('wako-offline', 1);
  r.onsuccess = () => {
    const tx = r.result.transaction(['meta', 'audio']);
    const m = tx.objectStore('meta').getAllKeys(), a = tx.objectStore('audio').getAll();
    tx.oncomplete = () => res({ meta: m.result.sort(), audio: a.result.map((x) => [x.key, x.bufs.length, x.texts.length]).sort() });
  };
}));
async function saveBook(page) {
  await book(page).getByRole('button', { name: 'Offline' }).click();
  const panel = page.locator('.offpanel');
  await panel.getByRole('button', { name: /^Save all for offline/ }).click();
  await expect(panel.locator('.offctl').first()).toContainText('✓ 2 of 2 saved offline');
}

test('the page opens without a connection once it has been loaded', async ({ page, context, site, backend }) => {
  await page.goto(site);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).scope)).toBe(site);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Wako205');
  // The libraries loaded on first use come from the service worker's cache.
  await page.evaluate(() => Promise.all(['jszip', 'marked', 'dompurify', 'pdflib'].map(needLib)));
  expect(await page.evaluate(() => [typeof JSZip, typeof marked, typeof DOMPurify, typeof PDFLib])).toEqual(['function', 'object', 'function', 'object']);
  await expect(page.locator('#loginStatus')).toHaveText('Logging in needs a connection.');
  await expect(page.locator('#offlineEntry')).toBeHidden();             // nothing saved on this device yet
});

test('the service worker caches the same scripts and hashes as the page', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const page = [...html.matchAll(/<script src="([^"]+)" integrity="([^"]+)"/g), ...html.matchAll(/\{ src: '([^']+)', integrity: '([^']+)' \}/g)].map((m) => m[1] + ' ' + m[2]);
  const cached = [...sw.matchAll(/\['(https:[^']+)', '(sha384-[^']+)'\]/g)].map((m) => m[1] + ' ' + m[2]);
  expect(cached.sort()).toEqual(page.sort());
});

test('a chapter saved from the player plays offline without any request', async ({ page, context, site, backend }) => {
  await login(page, site);
  await openAudio(page);
  await book(page).getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
  const save = page.locator('#pOffline').getByRole('button', { name: /^Save chapter for offline \(about [\d.]+ (kB|MB)\)$/ });
  await expect(save).toBeVisible();
  await expect(page.locator('#pOffline').getByRole('button', { name: /^Save whole book for offline \(about/ })).toBeVisible();
  await save.click();
  await expect(page.locator('#pOffline').getByRole('button', { name: /^Save the other chapters for offline \(about/ })).toBeVisible();
  await expect(page.locator('#pOffline .offctl').first()).toContainText('✓ Saved offline');
  await expect(page.locator('#pChapter option').first()).toHaveText('Chapter 1 ✓ offline');
  expect((await stored(page)).audio).toEqual([['tester||book1|0', 2, 2]]);

  await context.setOffline(true);
  const before = backend.calls.length;
  await page.click('#pClose');
  await book(page).getByRole('button', { name: /Listen|Resume/ }).click();
  await expect(page.locator('#pText span.s')).toHaveCount(6);
  await expect(page.locator('#pChapter option').nth(1)).toBeDisabled();       // not saved, not available offline
  await page.evaluate(() => player.play());
  await expect.poll(() => page.evaluate(() => player.currentTime)).toBeGreaterThan(0.5);
  await page.evaluate(() => player.pause());
  expect(backend.calls.slice(before).filter((c) => c.action !== 'audio_progress')).toEqual([]);
  expect(backend.calls.length).toBe(before);
});

test('a whole book is saved from the library, with sizes, marks and removal', async ({ page, site, backend }) => {
  await login(page, site);
  await openAudio(page);
  await book(page).getByRole('button', { name: 'Offline' }).click();
  const panel = page.locator('.offpanel');
  await expect(panel.locator('.offrow')).toHaveCount(2);                      // converted chapters only
  await expect(panel.locator('.offrow').first()).toContainText('Chapter 1');
  await expect(panel.locator('.offrow').first().getByRole('button', { name: /^Save chapter for offline \(about/ })).toBeVisible();
  await panel.getByRole('button', { name: /^Save all for offline \(about/ }).click();
  await expect(panel.locator('.offctl').first()).toContainText('✓ 2 of 2 saved offline');
  await expect(book(page).locator('.grow .m').first()).toContainText('✓ offline');   // visible in the row too, also when offline
  await expect(book(page).getByRole('button', { name: 'Offline ✓' })).toBeVisible();
  expect((await stored(page)).meta).toEqual(['tester||book1|0', 'tester||book1|1']);
  expect(backend.callsOf('audio_part').length).toBe(4);

  await panel.locator('.offrow').nth(1).getByRole('button', { name: 'Remove offline copy' }).click();
  await expect(panel.getByRole('button', { name: /^Save the other chapters for offline \(about/ })).toBeVisible();
  await expect(book(page)).toContainText('✓ 1/2 offline');
  expect((await stored(page)).meta).toEqual(['tester||book1|0']);
  await panel.locator('.offctl').first().getByRole('button', { name: 'Remove offline copies' }).click();
  await expect(book(page).locator('.grow .m').first()).not.toContainText('✓');
  expect(await stored(page)).toEqual({ meta: [], audio: [] });
});

test('offline: the last library, saved chapters only, and server actions disabled', async ({ page, context, site, backend }) => {
  await login(page, site);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await openAudio(page);
  await saveBook(page);

  // A new visit without a connection: no session in this tab, so the page offers the saved chapters.
  const page2 = await context.newPage();
  await page2.goto(site);
  await expect.poll(() => page2.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page2.reload();
  await expect(page2.locator('#offlineEntryNote')).toContainText('The chapters tester saved on this device can be played without logging in.');
  await page2.click('#offlineBtn');
  await expect(page2.locator('#netBanner')).toContainText('You are offline.');
  await expect(page2.locator('#libNote')).toContainText('Offline: the library as received on');
  await expect(page2.locator('#library .libitem')).toHaveCount(2);
  await expect(book(page2).getByRole('button', { name: /Listen|Resume/ })).toBeEnabled();
  await expect(paper(page2).getByRole('button', { name: /Listen|Resume/ })).toBeDisabled();
  await book(page2).getByRole('button', { name: 'More actions' }).click();
  for (const b of [book(page2).getByRole('menuitem', { name: 'Delete' }), book(page2).getByRole('menuitem', { name: 'Add chapters' }), page2.locator('#audioBtn'), page2.locator('#previewBtn')]) {
    await expect(b).toHaveAttribute('aria-disabled', 'true');
    expect(await b.evaluate((x) => getComputedStyle(x).pointerEvents)).toBe('none');
  }
  await page2.click('#tabChat');
  await expect(page2.locator('#sendBtn')).toHaveAttribute('aria-disabled', 'true');
  await page2.click('#tabLib');
  await book(page2).getByRole('button', { name: /Listen|Resume/ }).click();
  await expect(page2.locator('#pText span.s')).toHaveCount(6);
  await expect(page2.locator('#pChapter option').nth(1)).toHaveText('Chapter 2 ✓ offline');
  await expect(page2.locator('#pChapter option').nth(2)).toBeDisabled();
});

test('positions and bookmarks saved offline are sent when the connection returns', async ({ page, context, site, backend }) => {
  await login(page, site);
  await openAudio(page);
  await saveBook(page);
  await book(page).getByRole('button', { name: /Listen|Resume/ }).click();
  await expect(page.locator('#pText span.s')).toHaveCount(6);

  await context.setOffline(true);
  const before = backend.callsOf('audio_progress').length;
  await page.evaluate(() => { player.currentTime = 5.2; });
  await page.locator('#pMarks .mark').nth(1).getByRole('button', { name: 'Save here' }).click();
  await expect(page.locator('#pStatus')).toContainText('sent to your account when the connection returns');
  await page.click('#pClose');                                                  // saves the last position
  const box = await page.evaluate(() => JSON.parse(localStorage.getItem('mp_outbox_tester')));
  expect(box.map((p) => p.slot || 'last').sort()).toEqual(['b1', 'last']);
  expect(backend.callsOf('audio_progress').length).toBe(before);

  await context.setOffline(false);                                              // still logged in: sent at once
  await expect.poll(() => backend.callsOf('audio_progress').length).toBe(before + 2);
  const sent = backend.callsOf('audio_progress').slice(before);
  expect(sent.find((p) => p.slot === 'b1')).toMatchObject({ id: 'book1', chapter: 0, token: 'tok-test' });
  expect(sent.find((p) => p.slot === 'b1').time).toBeCloseTo(5.2, 1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mp_outbox_tester')))).toEqual([]);
});

test('positions from offline listening without a session are sent after logging in', async ({ page, context, site, backend }) => {
  await login(page, site);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await openAudio(page);
  await saveBook(page);
  const page2 = await context.newPage();
  await page2.goto(site);
  await expect.poll(() => page2.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page2.reload();
  await page2.click('#offlineBtn');
  await book(page2).getByRole('button', { name: /Listen|Resume/ }).click();
  await expect(page2.locator('#pText span.s')).toHaveCount(6);
  await page2.evaluate(() => { player.currentTime = 6; });
  await page2.locator('#pMarks .mark').nth(2).getByRole('button', { name: 'Save here' }).click();
  const before = backend.callsOf('audio_progress').length;

  await context.setOffline(false);
  await expect(page2.locator('#netBanner')).toContainText('The connection is back. Log in');
  await page2.locator('#netBanner').getByRole('button', { name: 'Log in' }).click();
  await page2.fill('#user', 'tester');
  await page2.fill('#pass', 'secret');
  await page2.click('#loginBtn');
  await expect.poll(() => backend.callsOf('audio_progress').slice(before).map((p) => p.slot || 'last')).toContain('b2');
  expect(backend.callsOf('audio_progress').slice(before).find((p) => p.slot === 'b2').time).toBeCloseTo(6, 1);
  await expect(page2.locator('#netBanner')).toBeHidden();
});

test('logout deletes the offline copies and cached data of the user', async ({ page, site, backend }) => {
  await login(page, site);
  await openAudio(page);
  await saveBook(page);
  await book(page).getByRole('button', { name: /Listen|Resume/ }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
  await page.click('#pClose');
  expect(await page.evaluate(() => ['mp_lib_tester', 'mp_last_user', 'mp_pos_tester_book1'].map((k) => localStorage.getItem(k) !== null))).toEqual([true, true, true]);
  await page.click('#logoutBtn');
  await expect.poll(async () => (await stored(page)).meta).toEqual([]);
  expect((await stored(page)).audio).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /^mp_(lib_|shared_|outbox_|last_user|pos_|mark_)/.test(k)))).toEqual([]);
});

test('storage use is shown, persistent storage is requested, and the iPhone note is there', async ({ page, site, backend }) => {
  await page.addInitScript(() => {
    window.__persist = 0;
    navigator.storage.persist = () => { window.__persist++; return Promise.resolve(true); };
    navigator.storage.persisted = () => Promise.resolve(window.__persist > 0);
  });
  await login(page, site);
  await openAudio(page);
  await expect(page.locator('#offlineInfo')).toContainText(/Offline storage: [\d.]+ (kB|MB|GB) used, [\d.]+ (kB|MB|GB) free\./);
  await expect(page.locator('#offlineInfo')).toContainText('iPhone: add to Home Screen to keep them.');
  await saveBook(page);
  expect(await page.evaluate(() => window.__persist)).toBe(1);
  await expect(page.locator('#offlineInfo')).not.toContainText('may be deleted');
});

for (const theme of ['night', 'eye']) {
  test('offline controls at 360 px in the ' + theme + ' theme', async ({ page, context, site, backend }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await login(page, site);
    await page.evaluate((t) => setTheme(t), theme);
    await openAudio(page);
    await saveBook(page);
    await book(page).getByRole('button', { name: /Listen|Resume/ }).click();
    await expect(page.locator('#pText span.s').first()).toBeVisible();
    await context.setOffline(true);
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - 360,
      small: [...document.querySelectorAll('#audioView button, #netBanner button')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.textContent),
      mark: (() => { const m = document.querySelector('.offmark'), s = getComputedStyle(m), bg = getComputedStyle(m.closest('.card')); return [s.color, bg.backgroundColor]; })(),
    }));
    expect(r.overflow).toBe(0);
    expect(r.small).toEqual([]);
    expect(r.mark[0]).not.toBe(r.mark[1]);
    await expect(page.locator('#netBanner')).toBeVisible();
  });
}

test('an item another account shared is saved and replayed offline with its owner', async ({ page, context, site, backend }) => {
  backend.shared = [{
    id: 'shared1', owner: 'bob', mine: false, kind: 'book', title: 'Bob\'s Book', created: '2026-09-02T10:00:00Z', state: 'done',
    voice: 'Kore', lang: 'en-US', chars: 2800, pos: null, marks: {},
    chapters: [{ title: 'Part 1', n: 2, chars: 1400, status: 'done' }, { title: 'Part 2', n: 2, chars: 1400, status: 'done' }],
  }];
  backend.on('audio_text', () => ({ texts: ['Shared text one.', 'Shared text two.'] }));
  backend.on('audio_progress', () => ({}));
  await login(page, site);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await openAudio(page);
  const row = page.locator('#sharedLib .libitem').first();
  await row.getByRole('button', { name: 'Offline' }).click();
  await page.locator('#sharedLib .offpanel').getByRole('button', { name: /^Save all for offline/ }).click();
  await expect(row.getByRole('button', { name: 'Offline ✓' })).toBeVisible();
  expect((await stored(page)).meta).toEqual(['tester|bob|shared1|0', 'tester|bob|shared1|1']);
  backend.callsOf('audio_text').concat(backend.callsOf('audio_part')).forEach((c) => expect(c).toMatchObject({ id: 'shared1', owner: 'bob' }));

  // A new visit without a connection: the shared item is listed from the copy and plays from storage.
  const page2 = await context.newPage();
  await page2.goto(site);
  await expect.poll(() => page2.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page2.reload();
  await page2.click('#offlineBtn');
  const row2 = page2.locator('#sharedLib .libitem').first();
  await expect(row2).toContainText('Shared by bob');
  const before = backend.calls.length;
  await row2.getByRole('button', { name: /Listen|Resume/ }).click();
  await expect(page2.locator('#pText span.s').first()).toHaveText('Shared text one.');
  await page2.evaluate(() => { player.currentTime = 4.8; });
  await page2.locator('#pMarks .mark').nth(1).getByRole('button', { name: 'Save here' }).click();
  expect(backend.calls.length).toBe(before);
  expect(await page2.evaluate(() => JSON.parse(localStorage.getItem('mp_outbox_tester')).find((p) => p.slot === 'b1'))).toMatchObject({ id: 'shared1', owner: 'bob' });

  // Back online and logged in: the bookmark is sent with the owner.
  await context.setOffline(false);
  await page2.locator('#netBanner').getByRole('button', { name: 'Log in' }).click();
  await page2.fill('#user', 'tester');
  await page2.fill('#pass', 'secret');
  await page2.click('#loginBtn');
  await expect.poll(() => backend.callsOf('audio_progress').find((p) => p.slot === 'b1')).toMatchObject({ id: 'shared1', owner: 'bob', token: 'tok-test' });
});

test('offline, the next chapter that plays is the next saved one', async ({ page, context, site, backend }) => {
  backend.library[0].chapters[2] = { title: 'Chapter 3', n: 2, chars: 1400, status: 'done' };
  await login(page, site);
  await openAudio(page);
  await book(page).getByRole('button', { name: 'Offline' }).click();
  const panel = page.locator('.offpanel');
  await expect(panel.locator('.offrow')).toHaveCount(3);
  await panel.locator('.offrow').nth(0).getByRole('button', { name: /^Save chapter/ }).click();
  await panel.locator('.offrow').nth(2).getByRole('button', { name: /^Save chapter/ }).click();
  await expect(book(page)).toContainText('✓ 2/3 offline');
  await book(page).getByRole('button', { name: /Listen|Resume/ }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
  await context.setOffline(true);
  const before = backend.calls.length;
  await page.evaluate(() => { player.currentTime = player.duration - 0.4; player.play(); });
  await expect(page.locator('#pChapter')).toHaveValue('2');                    // chapter 2 is not saved: skipped
  await expect.poll(() => page.evaluate(() => !player.paused)).toBe(true);
  await page.evaluate(() => player.pause());
  expect(backend.calls.length).toBe(before);
});

test('library rows say what is saved on this device; Refresh asks the server even when the device reports offline', async ({ page, context, site, backend }) => {
  await login(page, site);
  await openAudio(page);
  await book(page).getByRole('button', { name: 'Offline' }).click();
  await page.locator('.offpanel').getByRole('button', { name: /^Save all for offline/ }).click();
  await expect(book(page).locator('.grow .m').first()).toContainText('✓ offline');
  await context.setOffline(true);
  await expect(paper(page).locator('.grow .m').first()).toContainText('not on this device');
  await expect(paper(page)).toHaveClass(/notoff/);
  await expect(book(page)).not.toHaveClass(/notoff/);
  // The device says offline, but the network works: Refresh loads the library anyway.
  await context.setOffline(false);
  await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }));
  const n = backend.callsOf('audio_library').length;
  await page.click('#libRefresh');
  await expect.poll(() => backend.callsOf('audio_library').length).toBe(n + 1);
  await expect(paper(page).locator('.grow .m').first()).not.toContainText('not on this device');
});

test('the first three lofi songs are kept on the device after login, and the music plays offline from them', async ({ page, context, site, backend }) => {
  test.setTimeout(90000);
  await login(page, site);
  await openAudio(page);
  const first3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'music/lofi/tracks.json'), 'utf8')).tracks.slice(0, 3).map((t) => t.file);
  const kept = () => page.evaluate(async () => (await (await caches.open('wako-lofi-v1')).keys()).map((r) => decodeURIComponent(r.url.split('/').pop())).sort());
  await expect.poll(kept, { timeout: 40000 }).toEqual(['tracks.json', ...first3].sort());
  // Offline: a new song is chosen among the kept ones only.
  await context.setOffline(true);
  const titles = JSON.parse(fs.readFileSync(path.join(ROOT, 'music/lofi/tracks.json'), 'utf8')).tracks.slice(0, 3).map((t) => t.title);
  await page.evaluate(() => { mFresh = true; resetMusic(); });
  await expect(page.locator('#mStatus')).toHaveText(/^(Playing|Ready): /, { timeout: 30000 });
  const label = (await page.locator('#mStatus').textContent()).replace(/^(Playing|Ready): /, '').replace(/\.$/, '');
  expect(titles).toContain(label);
});
