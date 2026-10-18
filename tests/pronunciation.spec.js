// The pronunciation list is gone: new conversions are sent as written. Books converted earlier with a
// list (mp_pron_used_<id>) still show the original spelling in the player. Mock backend only.
const { test, expect, login, openAudio, INDEX_URL } = require('./support/backend');
const { makeBookPdf } = require('./support/media');

test('no pronunciation box; an old list in this browser is not applied to new conversions', async ({ page, backend }) => {
  const pdf = await makeBookPdf({ chapters: 3 });
  await page.goto(INDEX_URL);
  await page.evaluate(() => localStorage.setItem('mp_pron_tester', JSON.stringify([{ term: 'mill', say: 'M I L L' }, { term: 'lantern', say: 'lamp' }])));
  await login(page);
  await page.click('#tabAudio');
  await expect(page.locator('#pronBox')).toHaveCount(0);
  await page.setInputFiles('#apdf', { name: 'mill.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.locator('#bookChapters label').nth(1).locator('input').check();
  await page.click('#previewBtn');
  await expect.poll(() => backend.callsOf('audio_preview').length).toBe(1);
  expect(backend.callsOf('audio_preview')[0].text).not.toContain('M I L L');
  await page.click('#audioBtn');
  await expect(page.locator('#audioStatus')).toContainText('Started.');
  const text = backend.callsOf('audio_start')[0].chapters[1].text;
  expect(text).toContain('past the old mill while');
  expect(text).toContain('Nobody noticed the lantern in');
  expect(await page.evaluate(() => localStorage.getItem('mp_pron_used_new1'))).toBeNull();
});

test('a book converted with a list still shows the original spelling in the player', async ({ page, backend }) => {
  backend.on('audio_text', () => ({ texts: ['Layers of M O S two are thin. They grow by C V D.', 'The M O S two film is uniform.'] }));
  await page.goto(INDEX_URL);
  await page.evaluate(() => localStorage.setItem('mp_pron_used_book1', JSON.stringify([{ term: 'MoS2', say: 'M O S two' }, { term: 'CVD', say: 'C V D' }])));
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s')).toHaveText(['Layers of MoS2 are thin.', 'They grow by CVD.', 'The MoS2 film is uniform.']);
});
