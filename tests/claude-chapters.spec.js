const { test, expect, login } = require('./support/backend');
const { makeWordHeadedBookPdf, makeBookPdf } = require('./support/media');

test('a long book with fewer than five recognized chapters: Claude finds the headings among the short lines', async ({ page, backend }) => {
  test.setTimeout(60000);
  backend.on('audio_outline', (body) => {
    // Plays Claude: picks the word headings from the candidate lines.
    const chapters = body.cands.split('\n').map((s) => s.match(/^(\d+):(\d+) (ONE|TWO|THREE|FOUR|FIVE|SIX)$/)).filter(Boolean)
      .map((m) => ({ title: m[3], page: Number(m[1]) }));
    return { chapters };
  });
  await login(page);
  await page.click('#tabAudio');
  await page.setInputFiles('#apdf', { name: 'long.pdf', mimeType: 'application/pdf', buffer: await makeWordHeadedBookPdf() });
  await expect(page.locator('#kindLine')).toContainText('chapters found by Claude', { timeout: 30000 });
  const call = backend.callsOf('audio_outline')[0];
  expect(call.kind).toBe('book');
  expect(call.cands).toMatch(/^\d+:\d+ THREE$/m);
  expect(call.cands).not.toContain('going on quietly.');          // ordinary sentences are not sent
  const rows = page.locator('#bookChapters label');
  await expect(rows).toHaveCount(6);
  expect((await rows.allInnerTexts()).map((t) => t.split('\n')[0].trim())).toEqual(['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX']);
  await rows.nth(2).locator('input').check();
  await page.click('#audioBtn');
  await expect(page.locator('#audioStatus')).toContainText('Started.');
  const text = backend.callsOf('audio_start')[0].chapters[2].text;
  expect(text.startsWith('THREE\n\nText of chapter 3, line 0,')).toBe(true);
  expect(text).toContain('The last lines of chapter 3, line 6.');
  expect(text).not.toContain('chapter 2,');
  expect(text).not.toMatch(/quietly\. \d+ Text/);                    // page numbers left out
  // The same file chosen again: the saved answer is used, Claude is not paid a second time.
  await page.setInputFiles('#apdf', { name: 'long.pdf', mimeType: 'application/pdf', buffer: await makeWordHeadedBookPdf() });
  await expect(page.locator('#kindLine')).toContainText('chapters found by Claude', { timeout: 30000 });
  await expect(rows).toHaveCount(6);
  expect(backend.callsOf('audio_outline')).toHaveLength(1);
});

test('a short book does not ask Claude', async ({ page, backend }) => {
  await login(page);
  await page.click('#tabAudio');
  await page.setInputFiles('#apdf', { name: 'mill.pdf', mimeType: 'application/pdf', buffer: await makeBookPdf({ chapters: 3 }) });
  await expect(page.locator('#kindLine')).toContainText('Detected: book');
  expect(backend.callsOf('audio_outline')).toHaveLength(0);
});
