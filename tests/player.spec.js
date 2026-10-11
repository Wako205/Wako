const { test, expect, login, openAudio, SEG_TEXTS } = require('./support/backend');

const curIndex = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#pText span.s')).findIndex((s) => s.classList.contains('cur')));
const time = (page) => page.evaluate(() => document.getElementById('player').currentTime);

async function openBook(page) {
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#playerCard')).toBeVisible();
  await expect(page.locator('#pText span.s')).toHaveCount(6);
  await expect.poll(() => page.evaluate(() => document.getElementById('player').duration)).toBeGreaterThan(8);
}

test('opens a book and the highlight follows playback', async ({ page, backend }) => {
  await openBook(page);
  await expect(page.locator('#pTitle')).toHaveText('The Quiet Mill');
  expect(await page.locator('#pText span.s').allTextContents()).toEqual(SEG_TEXTS.flat());
  expect(backend.callsOf('audio_text')[0]).toMatchObject({ id: 'book1', chapter: 0 });
  expect(backend.callsOf('audio_part').filter((c) => c.chapter === 0).map((c) => c.index).sort()).toEqual([0, 1]);
  // Chapter 3 is not converted and cannot be chosen.
  await expect(page.locator('#pChapter option')).toHaveCount(3);
  await expect(page.locator('#pChapter option').nth(2)).toBeDisabled();

  await page.evaluate(() => document.getElementById('player').play());
  await expect.poll(() => curIndex(page)).toBe(0);
  await expect.poll(() => curIndex(page), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  const t = await time(page);
  expect(t).toBeGreaterThan(1.5);

  // Clicking a sentence of the second segment jumps there.
  await page.locator('#pText span.s').nth(4).click();
  await expect.poll(() => curIndex(page)).toBe(4);
  expect(await time(page)).toBeGreaterThan(4);
  await page.evaluate(() => document.getElementById('player').pause());
});

test('moves to another chapter and saves the position', async ({ page, backend }) => {
  await openBook(page);
  await page.selectOption('#pChapter', '1');
  await expect.poll(() => backend.callsOf('audio_text').map((c) => c.chapter)).toContain(1);
  await expect.poll(() => backend.callsOf('audio_progress').length).toBeGreaterThan(0);
  await page.click('#pPrev');
  await expect(page.locator('#pChapter')).toHaveValue('0');
});

test('saves two bookmarks that survive a reload', async ({ page, backend }) => {
  await openBook(page);
  await page.evaluate(() => { const p = document.getElementById('player'); p.currentTime = 5.2; });
  await expect.poll(() => curIndex(page)).toBe(3);
  const marks = page.locator('#pMarks .mark');
  await expect(marks).toHaveCount(3);
  await marks.nth(1).getByRole('button', { name: 'Save here' }).click();
  await expect(marks.nth(1)).toContainText('0:05');
  await expect(marks.nth(1)).toContainText('The second part begins here.');
  const saved = backend.callsOf('audio_progress').find((c) => c.slot === 'b1');
  expect(saved).toMatchObject({ id: 'book1', chapter: 0, slot: 'b1', label: 'The second part begins here.' });
  expect(saved.time).toBeCloseTo(5.2, 1);

  await page.evaluate(() => { document.getElementById('player').currentTime = 0.5; });
  await marks.nth(2).getByRole('button', { name: 'Save here' }).click();
  await expect(marks.nth(2)).toContainText('0:00');

  await page.reload();
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: /Listen|Resume/ }).click();
  await expect(marks.nth(1)).toContainText('0:05');
  await expect(marks.nth(2)).toContainText('0:00');
  await marks.nth(1).getByRole('button', { name: 'Go' }).click();
  await expect.poll(() => time(page)).toBeGreaterThan(5);
  await expect.poll(() => curIndex(page)).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => document.getElementById('player').pause());
});
