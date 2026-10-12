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
  await page.click('#trBtn');
  await expect(page.locator('#trStatus')).toHaveText('Done.');
  expect(backend.callsOf('translate')[0].paras.join(' ')).toContain('end of chapter 2');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#trDownload')]);
  expect(dl.suggestedFilename()).toBe('mill_zh-Hans.txt');
});

test('long text is sent in several requests of at most 40,000 characters', async ({ page, backend }) => {
  await login(page);
  await page.click('#tabTrans');
  const para = 'x'.repeat(9000);
  await page.fill('#trText', Array.from({ length: 10 }, () => para).join('\n\n'));
  await page.click('#trBtn');
  await expect(page.locator('#trStatus')).toHaveText('Done.');
  const calls = backend.callsOf('translate');
  expect(calls.length).toBe(3);
  calls.forEach((c) => expect(c.paras.join('').length).toBeLessThanOrEqual(40000));
  await expect(page.locator('#trOut .dst')).toHaveCount(10);
});
