const { test, expect, login } = require('./support/backend');
const { makeBookPdf, NM } = require('./support/media');
const JSZip = require(NM + '/jszip');

async function makeDocx(paras) {
  const zip = new JSZip();
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const body = paras.map((p) => p === null ? '<w:p/>' : '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' +
    p.map((r, i) => '<w:r>' + (i ? '<w:rPr><w:b/></w:rPr>' : '') + '<w:t xml:space="preserve">' + r + '</w:t></w:r>').join('') + '</w:p>').join('');
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="' + W + '"><w:body>' + body + '</w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('pasted text is translated paragraph by paragraph into the chosen language, which is remembered', async ({ page, backend }) => {
  await login(page);
  await page.click('#tabTrans');
  await expect(page.locator('#trTo')).toHaveValue('zh-Hans');
  await expect(page.locator('#trUsage')).toContainText('of 2,000k characters this month');
  await page.selectOption('#trTo', 'ja');
  await page.fill('#trText', 'First paragraph,\nwith a line break.\n\n\nSecond paragraph.');
  await page.uncheck('#trRevise');
  await page.click('#trBtn');
  await expect(page.locator('#trStatus')).toHaveText('Done.');
  const call = backend.callsOf('translate')[0];
  expect(call).toMatchObject({ to: 'ja', paras: ['First paragraph,\nwith a line break.', 'Second paragraph.'] });
  await expect(page.locator('#trOut .dst')).toHaveText(['[ja] First paragraph,\nwith a line break.', '[ja] Second paragraph.']);
  await expect(page.locator('#trOut .src').first()).toBeHidden();
  await page.click('#trBoth');
  await expect(page.locator('#trOut .src').first()).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#trDownload')]);
  expect(dl.suggestedFilename()).toBe('translation_ja.txt');
  await page.reload();
  await page.click('#tabTrans');
  await expect(page.locator('#trTo')).toHaveValue('ja');
});

test('a Word file comes back as a Word file with each paragraph translated in place', async ({ page, backend }) => {
  await login(page);
  await page.click('#tabTrans');
  await page.setInputFiles('#trFile', { name: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: await makeDocx([['Hello ', 'world'], null, ['Second']]) });
  await expect(page.locator('#trFileName')).toHaveText('notes.docx');
  await expect(page.locator('#trText')).toHaveValue('Hello world\n\nSecond');
  await page.uncheck('#trRevise');
  await page.click('#trBtn');
  await expect(page.locator('#trStatus')).toHaveText('Done.');
  expect(backend.callsOf('translate')[0].paras).toEqual(['Hello world', 'Second']);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#trDownload')]);
  expect(dl.suggestedFilename()).toBe('notes_zh-Hans.docx');
  const zip = await JSZip.loadAsync(require('fs').readFileSync(await dl.path()));
  const xml = await zip.file('word/document.xml').async('string');
  expect(xml).toContain('[zh-Hans] Hello world');
  expect(xml).toContain('[zh-Hans] Second');
  expect(xml).toContain('Heading1');                                   // paragraph formatting kept
  expect(xml).not.toContain('>world<');
});

test('a PDF is read in the browser and translated as text', async ({ page, backend }) => {
  await login(page);
  await page.click('#tabTrans');
  await page.setInputFiles('#trFile', { name: 'mill.pdf', mimeType: 'application/pdf', buffer: await makeBookPdf({ chapters: 2 }) });
  await expect(page.locator('#trFileName')).toHaveText('mill.pdf');
  await expect(page.locator('#trText')).toHaveValue(/Chapter 1/);
  await page.uncheck('#trRevise');
  await page.click('#trBtn');
  await expect(page.locator('#trStatus')).toHaveText('Done.');
  expect(backend.callsOf('translate')[0].paras.join(' ')).toContain('end of chapter 2');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#trDownload')]);
  expect(dl.suggestedFilename()).toBe('mill_zh-Hans.txt');
});

test('long text goes in requests of at most 10,000 characters, at most 30,000 a minute; a 429 refusal is retried', async ({ page, backend }) => {
  await page.clock.install();
  await login(page);
  await page.click('#tabTrans');
  const para = 'x'.repeat(4000);
  await page.fill('#trText', Array.from({ length: 10 }, () => para).join('\n\n'));   // 40,000 characters
  let refused = 0;
  backend.on('translate', (body) => {
    if (backend.callsOf('translate').length === 2 && !refused++) return { ok: false, error: 'Azure Translator error 429: The server rejected the request because the client has exceeded request limits.' };
    return { translations: body.paras.map((p) => '[t] ' + p), detected: [], used: 0, cap: 2000000 };
  });
  await page.uncheck('#trRevise');
  await page.click('#trBtn');
  await expect.poll(() => backend.callsOf('translate').length).toBe(2);             // the second one is refused
  await expect(page.locator('#trStatus')).toContainText('waiting');
  await page.clock.runFor(21000);
  await expect.poll(() => backend.callsOf('translate').length).toBe(3);             // retried
  await expect.poll(() => backend.callsOf('translate').length, { timeout: 3000 }).toBe(3);   // 30,000 sent within the minute: the fourth waits
  await page.clock.runFor(61000);
  await expect(page.locator('#trStatus')).toHaveText('Done.');
  const calls = backend.callsOf('translate');
  expect(calls.length).toBe(6);                                                       // 5 requests of 8,000 characters, one of them twice
  calls.forEach((c) => expect(c.paras.join('').length).toBeLessThanOrEqual(10000));
  await expect(page.locator('#trOut .dst')).toHaveCount(10);
});

test('Chinese returned unchanged by automatic detection is sent again as Chinese; the source can also be chosen', async ({ page, backend }) => {
  backend.on('translate', (body) => ({
    translations: body.paras.map((p) => (body.from ? '[' + body.from + '>' + body.to + '] Jiajing' : p)),   // auto: unchanged, as Azure did
    detected: body.paras.map(() => 'en'), used: 0, cap: 2000000 }));
  await login(page);
  await page.click('#tabTrans');
  await page.selectOption('#trTo', 'en');
  await page.fill('#trText', '被大火烧了万寿宫而迁居到玉熙宫的嘉靖帝。\n\nAlready English here.');
  await page.uncheck('#trRevise');
  await page.click('#trBtn');
  await expect(page.locator('#trStatus')).toHaveText('Done.');
  await expect(page.locator('#trOut .dst')).toHaveText(['[zh-Hans>en] Jiajing', 'Already English here.']);
  expect(backend.callsOf('translate').map((c) => c.from || '')).toEqual(['', 'zh-Hans']);
  await page.selectOption('#trFrom', 'ja');
  await page.uncheck('#trRevise');
  await page.click('#trBtn');
  await expect.poll(() => backend.callsOf('translate').length).toBe(3);
  expect(backend.callsOf('translate')[2].from).toBe('ja');
});

test('Claude revises the whole Azure draft, and translates what Azure left in Chinese', async ({ page, backend }) => {
  backend.on('translate', (body) => ({ translations: body.paras.map((p) => (/嘉靖/.test(p) ? p : '[az] ' + p)), detected: [], used: 0, cap: 2000000 }));
  await login(page);
  await page.click('#tabTrans');
  await expect(page.locator('#trRevise')).toBeChecked();
  await expect(page.locator('.trby')).toHaveText('Powered by Azure AI Translator & Claude');
  await page.selectOption('#trTo', 'en');
  await page.fill('#trText', '被大火烧了万寿宫而迁居到玉熙宫的嘉靖帝。\n\nSecond paragraph.');
  await page.click('#trBtn');
  await expect(page.locator('#trStatus')).toContainText('Revised by Claude', { timeout: 20000 });
  const call = backend.callsOf('translate_revise')[0];
  expect(call).toMatchObject({ to: 'en', revise: true });
  expect(call.items.map((x) => x.missing)).toEqual([true, false]);              // Azure returned the Chinese unchanged
  expect(call.items[1].mt).toBe('[az] Second paragraph.');
  await expect(page.locator('#trOut .dst')).toHaveText(['[claude] 被大火烧了万寿宫而迁居到玉熙宫的嘉靖帝。', '[claude] Second paragraph.']);
});

test('without the revision, only paragraphs Azure left untranslated go to Claude', async ({ page, backend }) => {
  backend.on('translate', (body) => ({ translations: body.paras.map((p) => (/嘉靖/.test(p) ? p : '[az] ' + p)), detected: [], used: 0, cap: 2000000 }));
  await login(page);
  await page.click('#tabTrans');
  await page.uncheck('#trRevise');
  await page.selectOption('#trTo', 'en');
  await page.fill('#trText', '被大火烧了万寿宫而迁居到玉熙宫的嘉靖帝。\n\nSecond paragraph.');
  await page.click('#trBtn');
  await expect(page.locator('#trStatus')).toContainText('Missing paragraphs translated by Claude', { timeout: 20000 });
  expect(backend.callsOf('translate_revise')[0].revise).toBe(false);
  await expect(page.locator('#trOut .dst')).toHaveText(['[claude] 被大火烧了万寿宫而迁居到玉熙宫的嘉靖帝。', '[az] Second paragraph.']);
});
