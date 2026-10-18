// pdf-lib, JSZip, marked and DOMPurify are not loaded with the page, only when first needed
// (paper splitting, .docx reading, chat Markdown), under their integrity hashes. Mock backend only.
const { test, expect, login, INDEX_URL } = require('./support/backend');
const { makeBookPdf, NM } = require('./support/media');
const JSZip = require(NM + '/jszip');

const PKGS = ['pdf-lib@', 'jszip@', 'marked@', 'dompurify@'];
function watch(page) {
  const seen = [];
  page.on('request', (r) => { const p = PKGS.find((x) => r.url().includes('/npm/' + x)); if (p) seen.push(p.slice(0, -1)); });
  return seen;
}
const loaded = (page) => page.evaluate(() => [typeof PDFLib, typeof JSZip, typeof marked, typeof DOMPurify]);

test('the page and the library load without any of the four scripts', async ({ page, backend }) => {
  const seen = watch(page);
  await login(page);
  await page.click('#tabLib');
  await expect(page.locator('#library .libitem').first()).toBeVisible();
  await page.click('#tabAudio');
  await page.waitForTimeout(300);
  expect(seen).toEqual([]);
  expect(await loaded(page)).toEqual(['undefined', 'undefined', 'undefined', 'undefined']);
});

test('chat Markdown: plain text first, then rendered and sanitized once marked and DOMPurify are in', async ({ page, backend }) => {
  const seen = watch(page);
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.route('**/npm/marked@*/**', async (route) => { await gate; return route.fallback(); });   // hold marked back
  backend.on('chat_start', (b) => ({ jobId: 'j1', convId: b.convId }));
  backend.on('chat_run', () => ({ state: 'done', reply: 'Hello **world**. <img src=x onerror="window.__pwned=1"> [link](https://example.org/)', cost: 0.001, model: 'claude-test' }));
  await login(page);
  await page.click('#tabChat');
  await page.fill('#prompt', 'Hi');
  await page.click('#sendBtn');
  const md = page.locator('.msg.assistant .md').last();
  await expect(md).toContainText('Hello **world**.');                          // shown as plain text meanwhile
  expect(await md.locator('img, strong').count()).toBe(0);
  release();
  await expect(md.locator('strong')).toHaveText('world');
  expect(await md.locator('img').count()).toBe(0);
  await expect(md.locator('a')).toHaveAttribute('rel', 'noopener noreferrer');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(seen.sort()).toEqual(['dompurify', 'marked']);
  // A second reply uses the loaded libraries at once.
  await page.fill('#prompt', 'Again');
  await page.click('#sendBtn');
  await expect(page.locator('.msg.assistant .md strong')).toHaveCount(2);
  expect(seen.length).toBe(2);
});

test('reading a .docx loads JSZip; splitting a paper loads pdf-lib', async ({ page, backend }) => {
  const seen = watch(page);
  await page.goto(INDEX_URL);
  const zip = new JSZip();
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Word text.</w:t></w:r></w:p></w:body></w:document>');
  const docx = (await zip.generateAsync({ type: 'nodebuffer' })).toString('base64');
  expect(await page.evaluate(async (b64) => (await readDocx(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'a.docx'))).text.trim(), docx)).toBe('Word text.');
  expect(seen).toEqual(['jszip']);
  const pdf = (await makeBookPdf({ chapters: 3 })).toString('base64');
  expect(await page.evaluate(async (b64) => (await splitPdf(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))).total, pdf)).toBe(3);
  expect(seen).toEqual(['jszip', 'pdf-lib']);
});

test('a script that fails to load can be loaded on the next try', async ({ page, backend }) => {
  await page.goto(INDEX_URL);
  let fail = true;
  await page.route('**/npm/jszip@*/**', (route) => (fail ? route.abort() : route.fallback()));
  expect(await page.evaluate(() => needLib('jszip').then(() => 'ok', (e) => e.message))).toContain('Could not load');
  fail = false;
  expect(await page.evaluate(() => needLib('jszip').then(() => typeof JSZip))).toBe('function');
});
