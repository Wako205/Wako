const fs = require('fs');
const path = require('path');
const { test, expect, login } = require('./support/backend');

test('a GB18030 text file is read as a book, split into chapters and converted', async ({ page, backend }) => {
  await login(page);
  await page.click('#tabAudio');
  await page.setInputFiles('#apdf', { name: '大明故事.txt', mimeType: 'text/plain', buffer: fs.readFileSync(path.join(__dirname, 'fixtures', 'gb18030-book.txt')) });
  await expect(page.locator('#kindLine')).toContainText('Detected: book or plain text.');
  await expect(page.locator('#kindLine')).toContainText('text file');
  await expect(page.locator('#kindLine a')).toHaveCount(0);                    // no paper mode for text
  await expect(page.locator('#atitle')).toHaveValue('大明故事');
  const rows = page.locator('#bookChapters label');
  await expect(rows).toHaveCount(3);
  expect((await rows.allInnerTexts()).map((t) => t.split('\n')[0].trim())).toEqual(['第一章 磨坊', '第二章 小镇', '第三章 远桥']);
  await rows.nth(1).locator('input').check();
  await page.click('#audioBtn');
  await expect(page.locator('#audioStatus')).toContainText('Started.');
  const start = backend.callsOf('audio_start')[0];
  expect(start).toMatchObject({ kind: 'book', filename: '大明故事.txt', selected: [1] });
  expect(start.chapters[1].text).toContain('这是第2章的第29段');
  expect(start.chapters[1].text).not.toContain('第3章');
});

test('a UTF-8 English text file with "Chapter" headings', async ({ page, backend }) => {
  await login(page);
  await page.click('#tabAudio');
  const text = ['The Quiet Mill', ''].concat(...[1, 2, 3].map((c) => ['Chapter ' + c, ''].concat(Array.from({ length: 12 }, (_, k) => 'Paragraph ' + k + ' of chapter ' + c + ' goes on for a while.\n')))).join('\n');
  await page.setInputFiles('#apdf', { name: 'mill.txt', mimeType: 'text/plain', buffer: Buffer.from('﻿' + text) });
  const rows = page.locator('#bookChapters label');
  await expect(rows).toHaveCount(3);
  await expect(page.locator('#atitle')).toHaveValue('The Quiet Mill');            // the first line
  await rows.nth(2).locator('input').check();
  await page.click('#audioBtn');
  await expect(page.locator('#audioStatus')).toContainText('Started.');
  expect(backend.callsOf('audio_start')[0].chapters[2].text).toContain('Paragraph 11 of chapter 3');
});
