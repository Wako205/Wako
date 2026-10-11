const { test, expect, login, openAudio, INDEX_URL } = require('./support/backend');
const { makeBookPdf } = require('./support/media');

async function addTerm(page, term, say) {
  await page.fill('#pronTerm', term);
  await page.fill('#pronSay', say);
  await page.click('#pronAdd');
}

test('the list is edited in the Audio tab and stored per user', async ({ page, backend }) => {
  await login(page, 'alice');
  await openAudio(page);
  await page.click('#pronSummary');
  await expect(page.locator('#pronBox .notice')).toContainText('stored in this browser only');
  await addTerm(page, 'MoS2', 'M O S two');
  await addTerm(page, 'CVD', 'C V D');
  await page.fill('#pronTerm', 'hBN');
  await page.click('#pronAdd');
  await expect(page.locator('#pronStatus')).toHaveText('Enter both the term and how it is spoken.');
  await expect(page.locator('#pronList tr')).toHaveCount(2);
  await expect(page.locator('#pronSummary')).toHaveText('Pronunciation of terms (2)');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mp_pron_alice')))).toEqual([
    { term: 'CVD', say: 'C V D' }, { term: 'MoS2', say: 'M O S two' },
  ]);
  // Adding a term again replaces its spoken form.
  await page.fill('#pronSay', 'molybdenum disulfide');
  await page.fill('#pronTerm', 'MoS2');
  await page.press('#pronSay', 'Enter');
  await expect(page.locator('#pronList tr')).toHaveCount(2);
  await expect(page.locator('#pronList')).toContainText('molybdenum disulfide');
  await page.locator('#pronList tr').first().getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('#pronList tr')).toHaveCount(1);

  await page.reload();
  await openAudio(page);
  await expect(page.locator('#pronList tr')).toHaveCount(1);

  await page.click('#logoutBtn');
  await login(page, 'bob');
  await openAudio(page);
  await expect(page.locator('#pronList tr')).toHaveCount(0);
});

test('book text is respelled before audio_start, titles and other words are not', async ({ page, backend }) => {
  const pdf = await makeBookPdf({ chapters: 3 });
  await login(page);
  await page.click('#tabAudio');
  await page.click('#pronSummary');
  await addTerm(page, 'mill', 'M I L L');
  await addTerm(page, 'lantern', 'lamp');
  await addTerm(page, 'Chapter', 'Kapitel');
  await page.setInputFiles('#apdf', { name: 'mill.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.locator('#bookChapters label').nth(1).locator('input').check();

  await page.click('#previewBtn');
  await expect.poll(() => backend.callsOf('audio_preview').length).toBe(1);
  expect(backend.callsOf('audio_preview')[0].text).toContain('old M I L L while');

  await page.click('#audioBtn');
  await expect(page.locator('#audioStatus')).toContainText('Started.');
  const start = backend.callsOf('audio_start')[0];
  expect(start.chapters.map((c) => c.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3']);
  const text = start.chapters[1].text;
  expect(text).toContain('past the old M I L L while');
  expect(text).toContain('Nobody noticed the lamp in');
  expect(text).toContain('the miller had gone');          // whole words only
  expect(text).not.toContain('lantern');
  expect(text).toContain('end of chapter 2');             // terms are case-sensitive
  // The list used is kept with the new library item, for the player.
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mp_pron_used_new1'))).map((x) => x.term)).toEqual(['Chapter', 'lantern', 'mill']);
});

test('the player shows the original spelling', async ({ page, backend }) => {
  backend.on('audio_text', () => ({ texts: ['Layers of M O S two are thin. They grow by C V D.', 'The M O S two film is uniform.'] }));
  await page.goto(INDEX_URL);
  await page.evaluate(() => localStorage.setItem('mp_pron_used_book1', JSON.stringify([{ term: 'MoS2', say: 'M O S two' }, { term: 'CVD', say: 'C V D' }])));
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s')).toHaveText(['Layers of MoS2 are thin.', 'They grow by CVD.', 'The MoS2 film is uniform.']);
});
