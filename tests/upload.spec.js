const { test, expect, login, CHUNK } = require('./support/backend');
const { makeBookPdf } = require('./support/media');

test('detects a book, converts only the chosen chapters and stores the whole book', async ({ page, backend }) => {
  const pdf = await makeBookPdf({ chapters: 5 });
  await login(page);
  await page.click('#tabAudio');
  await page.setInputFiles('#apdf', { name: 'mill.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('#kindLine')).toContainText('Detected: book or plain text.');
  const rows = page.locator('#bookChapters label');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText('Chapter 1');
  // Books start with nothing selected.
  await expect(page.locator('#audioBtn')).toBeDisabled();
  await rows.nth(1).locator('input').check();
  await rows.nth(3).locator('input').check();
  await expect(page.locator('#bookSummary')).toContainText('Selected: 2');
  await page.selectOption('#avoice', 'Aoede');
  await page.click('#audioBtn');
  await expect(page.locator('#audioStatus')).toContainText('Started.');

  const start = backend.callsOf('audio_start')[0];
  expect(start).toMatchObject({ filename: 'mill.pdf', voice: 'Aoede', kind: 'book', selected: [1, 3] });
  expect(start.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4', 'Chapter 5']);
  expect(start.chapters[2].text).toContain('end of chapter 3');
  expect(start.chapters[2].text).not.toMatch(/^Chapter/);
  expect(start.parts).toBeUndefined();
});

test('uploads the original PDF in 4 MiB chunks, in order', async ({ page, backend }) => {
  const pdf = await makeBookPdf({ chapters: 3, padBytes: Math.round(2.3 * CHUNK) });
  const n = Math.ceil(pdf.length / CHUNK);
  expect(n).toBe(3);
  await login(page);
  await page.click('#tabAudio');
  await page.setInputFiles('#apdf', { name: 'big.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('#bookChapters label')).toHaveCount(3);
  await page.locator('#bookChapters label').nth(0).locator('input').check();
  await page.click('#audioBtn');
  await expect(page.locator('#audioStatus')).toContainText('Started.', { timeout: 30000 });

  const ups = backend.callsOf('pdf_upload');
  expect(ups.map((u) => u.index)).toEqual([0, 1, 2]);
  ups.forEach((u) => expect(u).toMatchObject({ id: 'new1', size: pdf.length, filename: 'big.pdf', token: 'tok-test' }));
  const sizes = ups.map((u) => Buffer.from(u.data, 'base64').length);
  expect(sizes).toEqual([CHUNK, CHUNK, pdf.length - 2 * CHUNK]);
  expect(Buffer.concat(ups.map((u) => Buffer.from(u.data, 'base64'))).equals(pdf)).toBe(true);
  // The upload starts only after the conversion was accepted.
  const order = backend.calls.map((c) => c.action).filter((a) => a === 'audio_start' || a === 'pdf_upload');
  expect(order[0]).toBe('audio_start');
});

test('a failed upload chunk is retried', async ({ page, backend }) => {
  const pdf = await makeBookPdf({ chapters: 3 });
  let failed = false;
  backend.on('pdf_upload', (b) => { if (!failed) { failed = true; return { ok: false, error: 'Temporary failure' }; } return { done: true }; });
  await login(page);
  await page.click('#tabAudio');
  await page.setInputFiles('#apdf', { name: 'small.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.locator('#bookChapters label').nth(0).locator('input').check();
  await page.click('#audioBtn');
  await expect(page.locator('#audioStatus')).toContainText('Started.', { timeout: 20000 });
  await expect(page.locator('#audioStatus')).not.toContainText('could not be saved');
  expect(backend.callsOf('pdf_upload').map((u) => u.index)).toEqual([0, 0]);
});
