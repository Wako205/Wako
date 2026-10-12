const fs = require('fs');
const path = require('path');
const { test, expect, login } = require('./support/backend');

// A Chinese PDF whose font (STSong-Light, Adobe-GB1) is not embedded: pdf.js needs the character maps to read it.
test('a Chinese PDF with fonts that are not embedded is read, using the character maps served with the site', async ({ page, backend }) => {
  const pdf = fs.readFileSync(path.join(__dirname, 'fixtures', 'cid-chinese.pdf'));
  const cmaps = [];
  page.on('request', (r) => { if (/\/Wako\/pdfjs\/cmaps\/.+\.bcmap$/.test(r.url())) cmaps.push(r.url()); });
  await login(page);
  await page.click('#tabAudio');
  await page.setInputFiles('#apdf', { name: 'mill.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.locator('#kindLine')).toContainText('Detected: book or plain text.');
  const rows = page.locator('#bookChapters label');
  // Nothing would be found without the maps. The contents list has no page numbers; its titles still mark the chapters.
  await expect(rows).toHaveCount(6);
  expect((await rows.allInnerTexts()).map((t) => t.split('\n')[0].trim())).toEqual(['磨坊', '小镇', '远桥', '花', '雾中的灯', '归途']);
  await rows.nth(1).locator('input').check();
  await page.click('#audioBtn');
  await expect(page.locator('#audioStatus')).toContainText('Started.');
  const start = backend.callsOf('audio_start')[0];
  expect(start.chapters[1].text).toContain('清晨的雾气还没有散去');
  expect(start.chapters[1].text).not.toContain('远桥');
  expect(cmaps.length).toBeGreaterThan(0);
  expect(backend.unexpected).toEqual([]);
});
