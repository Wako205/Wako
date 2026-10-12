const { test, expect, login } = require('./support/backend');
const { makeNumberedBookPdf } = require('./support/media');

for (const roman of [false, true]) {
  test('chapters headed only by a number' + (roman ? ' (Roman)' : '') + ' are found, and page numbers are not taken for chapters', async ({ page, backend }) => {
    await login(page);
    await page.click('#tabAudio');
    await page.setInputFiles('#apdf', { name: 'dog.pdf', mimeType: 'application/pdf', buffer: await makeNumberedBookPdf({ chapters: 4, roman }) });
    await expect(page.locator('#kindLine')).toContainText('Detected: book or plain text.');
    const rows = page.locator('#bookChapters label');
    await expect(rows).toHaveCount(4);
    expect((await rows.allInnerTexts()).map((t) => t.split('\n')[0].trim())).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3', 'Chapter 4']);
    await rows.nth(2).locator('input').check();
    await page.click('#audioBtn');
    await expect(page.locator('#audioStatus')).toContainText('Started.');
    const text = backend.callsOf('audio_start')[0].chapters[2].text;
    expect(text).toContain('Text of chapter 3, line 0,');
    expect(text).toContain('The last lines of chapter 3, line 4.');
    expect(text).not.toContain('chapter 2');
  });
}
