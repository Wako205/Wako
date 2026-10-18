// Recently played chapters are kept on the device (IndexedDB, marked "recent") and played from
// there next time without requests; up to RECENT_LIMIT per user, the least recently played removed
// first; chapters saved by the user are never removed. Mock backend only.
const { test, expect, login, openAudio } = require('./support/backend');

const book = (page) => page.locator('#library .libitem').nth(0);
const paper = (page) => page.locator('#library .libitem').nth(1);
/** Keys in the offline store, with " recent" for recent copies. */
const stored = (page) => page.evaluate(async () => {
  const db = await offDb();
  return (await idbReq(db.transaction('meta').objectStore('meta').getAll())).map((m) => m.key + (m.recent ? ' recent' : '')).sort();
});
const recentKeys = (page) => page.evaluate(() => [...recentIndex.keys()].sort());
async function listen(page, row) {
  await row.getByRole('button', { name: /Listen|Resume/ }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
}
async function chapter(page, c) {
  await page.selectOption('#pChapter', String(c));
  await expect.poll(() => page.evaluate(() => P && P.c)).toBe(c);
}

test('a played chapter plays again from the device, without any request', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  await listen(page, book(page));
  await expect.poll(() => recentKeys(page)).toEqual(['tester||book1|0']);
  expect(await stored(page)).toEqual(['tester||book1|0 recent']);
  expect(await page.evaluate(() => offIndex.size)).toBe(0);                     // not counted as saved for offline
  await expect(page.locator('#offlineInfo')).toContainText(/Recently played chapters: [\d.]+ (kB|MB)/);
  // Next session: a reload, then the same chapter again.
  await page.reload();
  await expect(page.locator('#appView')).toBeVisible();
  await openAudio(page);
  const ch1 = (a) => backend.callsOf(a).filter((x) => x.id === 'book1' && x.chapter === 0).length;   // chapter 2 is loaded in advance as before
  const parts = ch1('audio_part'), texts = ch1('audio_text');
  await listen(page, book(page));
  await expect(page.locator('#pText span.s')).toHaveCount(6);
  await page.evaluate(() => player.play());
  await expect.poll(() => page.evaluate(() => player.currentTime)).toBeGreaterThan(0.3);
  expect(ch1('audio_part')).toBe(parts);
  expect(ch1('audio_text')).toBe(texts);
  await expect(book(page)).not.toContainText('offline');                        // still not "saved offline"
});

test('above the limit the least recently played copy goes; chapters saved by the user stay', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  await listen(page, book(page));                                               // chapter 1: recent
  await expect.poll(() => recentKeys(page)).toEqual(['tester||book1|0']);
  // Room for one chapter only.
  await page.evaluate(() => { RECENT_LIMIT = [...recentIndex.values()][0].bytes + 1; });
  // Chapter 1 is saved for offline by the user: it leaves the recent copies without a download.
  const parts = backend.callsOf('audio_part').length;
  await page.locator('#pOffline').getByRole('button', { name: /^Save chapter for offline/ }).click();
  await expect.poll(() => page.evaluate(() => offIndex.size)).toBe(1);
  expect(backend.callsOf('audio_part').length).toBe(parts);
  expect(await recentKeys(page)).toEqual([]);
  // Chapter 2, then the paper: the older recent copy (chapter 2) makes room for the paper.
  await chapter(page, 1);
  await expect.poll(() => recentKeys(page)).toEqual(['tester||book1|1']);
  await page.click('#pClose');
  await listen(page, paper(page));
  await expect.poll(() => recentKeys(page)).toEqual(['tester||paper1|0']);
  expect(await stored(page)).toEqual(['tester||book1|0', 'tester||paper1|0 recent']);   // the saved chapter stays
});

test('playing a recent copy again makes it the most recent', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  await listen(page, book(page));
  await expect.poll(() => recentKeys(page)).toEqual(['tester||book1|0']);
  await chapter(page, 1);
  await expect.poll(() => recentKeys(page)).toEqual(['tester||book1|0', 'tester||book1|1']);
  await page.evaluate(() => { RECENT_LIMIT = [...recentIndex.values()].reduce((n, m) => n + m.bytes, 0) + 1; });
  await chapter(page, 0);                                                       // from the device; now the most recent
  await page.click('#pClose');
  await listen(page, paper(page));                                              // over the limit: chapter 2 goes
  await expect.poll(() => recentKeys(page)).toEqual(['tester||book1|0', 'tester||paper1|0']);
});

test('Log out removes the recent copies with the other offline data', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  await listen(page, book(page));
  await expect.poll(() => recentKeys(page)).toHaveLength(1);
  await page.click('#logoutBtn');
  await expect.poll(() => stored(page)).toEqual([]);
  expect(await recentKeys(page)).toEqual([]);
});
