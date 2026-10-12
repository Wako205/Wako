const { test, expect, login, openAudio } = require('./support/backend');

test('playback starts after the first parts while the rest of the chapter is still loading', async ({ page, backend }) => {
  // A long chapter: 6 parts; parts 2 and later arrive slowly.
  backend.library[0].chapters[0].n = 6;
  backend.on('audio_text', () => ({ texts: Array.from({ length: 6 }, (_, k) => 'Part ' + k + ' first sentence. Part ' + k + ' second sentence.') }));
  let release;
  const gate = new Promise((r) => { release = r; });
  backend.on('audio_part', (b) => (b.index < 2 ? { data: backend.mp3.toString('base64') } : gate.then(() => ({ data: backend.mp3.toString('base64') }))));
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();

  // Playing before the slow parts arrive: two parts ready, the rest shown as pending text.
  await expect.poll(() => page.evaluate(() => P && P.partial && P.partial.parts)).toBe(1);
  await page.evaluate(() => document.getElementById('player').play());
  await expect.poll(() => page.evaluate(() => document.getElementById('player').currentTime)).toBeGreaterThan(0.5);
  expect(await page.locator('#pText span.s.pend').count()).toBeGreaterThan(0);
  const before = await page.evaluate(() => document.getElementById('player').currentTime);

  // The rest arrives: the full chapter replaces the first parts at the same place, still playing.
  release();
  await expect.poll(() => page.evaluate(() => P.partial)).toBeNull();
  await expect(page.locator('#pText span.s.pend')).toHaveCount(0);
  const after = await page.evaluate(() => ({ t: document.getElementById('player').currentTime, paused: document.getElementById('player').paused }));
  expect(after.t).toBeGreaterThanOrEqual(before - 0.3);
  expect(after.paused).toBe(false);
  await page.evaluate(() => document.getElementById('player').pause());
});

test('a chapter being loaded in the background starts at once when chosen', async ({ page, backend }) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  backend.on('audio_part', (b) => (b.chapter === 1 && b.index === 1 ? gate.then(() => ({ data: backend.mp3.toString('base64') })) : { data: backend.mp3.toString('base64') }));
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  // Chapter 1 is complete; chapter 2 is loaded in the background (its second part is held back).
  await expect.poll(() => backend.callsOf('audio_part').filter((c) => c.chapter === 1).length).toBe(2);
  await page.selectOption('#pChapter', '1');
  await expect.poll(() => page.evaluate(() => P.c === 1 && !!P.partial)).toBe(true);    // plays its first part without waiting
  await page.evaluate(() => player.play());
  await expect.poll(() => page.evaluate(() => !player.paused)).toBe(true);
  release();
  await expect.poll(() => page.evaluate(() => P.cache[1] && P.cache[1].parts)).toBe(2);
  await page.evaluate(() => player.pause());
});
