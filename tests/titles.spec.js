const { test, expect, login } = require('./support/backend');
const { PDFDocument, StandardFonts } = require(require('./support/media').NM + '/pdf-lib');

async function pdf({ meta, big } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  if (meta !== undefined) doc.setTitle(meta);
  for (let c = 1; c <= 3; c++) {
    const page = doc.addPage([420, 595]);
    if (c === 1 && big) page.drawText(big, { x: 60, y: 560, size: 24, font });
    page.drawText('Chapter ' + c, { x: 40, y: 520, size: 16, font });
    for (let k = 0; k < 20; k++) page.drawText('A sentence of chapter ' + c + ', number ' + k + ', long enough to read.', { x: 40, y: 490 - 14 * k, size: 10, font });
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
async function choose(page, name, buffer) {
  await page.click('#tabAudio');
  await page.setInputFiles('#apdf', { name, mimeType: 'application/pdf', buffer });
  await expect(page.locator('#kindLine')).toContainText('Detected');
}

test('the title comes from the PDF properties, can be edited, and is sent with the conversion', async ({ page, backend }) => {
  await login(page);
  await choose(page, 'A.Zee-Fly_by_Night(2020).pdf', await pdf({ meta: 'Fly by Night Physics' }));
  await expect(page.locator('#atitle')).toHaveValue('Fly by Night Physics');
  await page.fill('#atitle', 'Fly by Night');
  await page.locator('#bookChapters label').first().locator('input').check();
  await page.click('#audioBtn');
  await expect(page.locator('#audioStatus')).toContainText('Started.');
  expect(backend.callsOf('audio_start')[0]).toMatchObject({ filename: 'A.Zee-Fly_by_Night(2020).pdf', title: 'Fly by Night' });
});

test('without a usable title in the properties, the largest text on the first page is the title', async ({ page, backend }) => {
  await login(page);
  await choose(page, 'scan_0042.pdf', await pdf({ meta: 'Microsoft Word - draft7.docx', big: 'The Quiet Mill' }));
  await expect(page.locator('#atitle')).toHaveValue('The Quiet Mill');
});

test('otherwise the file name is made readable', async ({ page, backend }) => {
  await login(page);
  await choose(page, 'Heart-of-a-Dog-by-Mikhail-Bulgakov-pdf-free-download.pdf', await pdf());
  await expect(page.locator('#atitle')).toHaveValue('Heart of a Dog by Mikhail Bulgakov');
});

test('a library item can be renamed; Escape cancels', async ({ page, backend }) => {
  await login(page);
  await page.click('#tabAudio');
  const first = page.locator('#library .libitem').first();
  await expect(first.locator('.t')).toHaveText('The Quiet Mill');
  await first.getByRole('button', { name: 'Rename' }).click();
  const box = first.getByRole('textbox', { name: 'New title' });
  await box.fill('Something else');
  await box.press('Escape');
  await expect(first.locator('.t')).toHaveText('The Quiet Mill');
  expect(backend.callsOf('audio_rename')).toHaveLength(0);
  await first.getByRole('button', { name: 'Rename' }).click();
  await first.getByRole('textbox', { name: 'New title' }).fill('  The   Mill on the River ');
  await first.getByRole('textbox', { name: 'New title' }).press('Enter');
  await expect(page.locator('#library .libitem').first().locator('.t')).toHaveText('The Mill on the River');
  expect(backend.callsOf('audio_rename')[0]).toMatchObject({ id: 'book1', title: 'The Mill on the River' });
});
