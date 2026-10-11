const { test, expect, login, openAudio } = require('./support/backend');

const state = (page) => page.evaluate(() => ({ paused: player.paused, chapter: document.getElementById('pChapter').value, volume: player.volume, fade: sleepFade, t: player.currentTime }));

async function openBook(page) {
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s')).toHaveCount(6);
  await expect.poll(() => page.evaluate(() => player.duration)).toBeGreaterThan(8);
}
async function choose(page, label) {
  await page.click('#pSleepBtn');
  await expect(page.locator('#pSleepMenu')).toBeVisible();
  await page.locator('#pSleepMenu').getByRole('button', { name: label }).click();
  await expect(page.locator('#pSleepMenu')).toBeHidden();
}

test('stops after 15 minutes of listening, fading out over the last 10 seconds', async ({ page, backend }) => {
  await page.clock.install();
  await openBook(page);
  // Only the audio element's events drive the countdown: a page in the background may get no timers at all.
  await page.evaluate(() => { window.setInterval = () => 0; });
  // A long chapter, so the audio does not end during the test.
  await page.evaluate(() => { player.loop = true; });
  await choose(page, '15 min');
  await expect(page.locator('#pSleepBtn')).toHaveText('☾ 15:00');
  await page.evaluate(() => player.play());
  await expect.poll(async () => (await state(page)).paused).toBe(false);

  await page.clock.fastForward(870000);
  await expect.poll(() => page.locator('#pSleepBtn').textContent()).toMatch(/^☾ 0:(2|3)\d$/);
  expect((await state(page)).volume).toBe(1);

  await page.clock.fastForward(25000);
  await expect.poll(async () => (await state(page)).fade).toBeLessThan(1);
  await expect.poll(async () => (await state(page)).fade).toBeGreaterThan(0);
  expect((await state(page)).paused).toBe(false);

  const saved = backend.callsOf('audio_progress').length;
  await page.clock.fastForward(12000);
  await expect.poll(async () => (await state(page)).paused).toBe(true);
  expect((await state(page)).volume).toBe(1);                  // restored for the next play
  await expect(page.locator('#pSleepBtn')).toHaveText('☾');
  await expect(page.locator('#pStatus')).toHaveText('Sleep timer: playback stopped.');
  await expect.poll(() => backend.callsOf('audio_progress').length).toBeGreaterThan(saved);
  expect(backend.callsOf('audio_progress').at(-1)).toMatchObject({ id: 'book1', chapter: 0 });
});

test('the countdown pauses while playback is paused', async ({ page, backend }) => {
  await page.clock.install();
  await openBook(page);
  await page.evaluate(() => { player.loop = true; });
  await choose(page, '30 min');
  await page.clock.fastForward(600000);                            // not playing: nothing counted
  await expect(page.locator('#pSleepBtn')).toHaveText('☾ 30:00');
  await page.evaluate(() => player.play());
  await page.clock.fastForward(300000);
  await expect.poll(() => page.locator('#pSleepBtn').textContent()).toMatch(/^☾ 2[45]:\d\d$/);
  await page.evaluate(() => player.pause());
});

test('stops at the end of the chapter instead of moving to the next one', async ({ page, backend }) => {
  await openBook(page);
  await choose(page, 'End of chapter');
  await expect(page.locator('#pSleepBtn')).toHaveText('☾ End');
  await page.evaluate(() => { window.__minFade = 1; setInterval(() => { window.__minFade = Math.min(window.__minFade, sleepFade); }, 50); player.currentTime = player.duration - 3; player.play(); });
  await expect.poll(async () => (await state(page)).paused, { timeout: 15000 }).toBe(true);
  const s = await state(page);
  expect(s.chapter).toBe('0');
  expect(s.volume).toBe(1);
  expect(await page.evaluate(() => window.__minFade)).toBeLessThan(0.5);   // it faded out
  await expect(page.locator('#pSleepBtn')).toHaveText('☾');
});

test('can be cancelled, and the last choice is remembered', async ({ page, backend }) => {
  await page.clock.install();
  await openBook(page);
  await choose(page, '60 min');
  await expect(page.locator('#pSleepBtn')).toHaveText('☾ 1:00:00');
  await expect(page.locator('#pSleepBtn')).toHaveAttribute('aria-label', 'Sleep timer: stops in 1:00:00');
  await choose(page, 'Cancel timer');
  await expect(page.locator('#pSleepBtn')).toHaveText('☾');
  await page.evaluate(() => { player.loop = true; player.play(); });
  await page.clock.fastForward(3660000);
  expect((await state(page)).paused).toBe(false);
  await page.evaluate(() => player.pause());

  await page.reload();
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: /Listen|Resume/ }).click();
  await page.click('#pSleepBtn');
  await expect(page.locator('#pSleepMenu button.last')).toHaveText('60 min');
  await expect(page.locator('#pSleepCancel')).toBeHidden();
});

for (const theme of ['day', 'night', 'eye']) {
  test('timer controls are visible in the ' + theme + ' theme', async ({ page, backend }) => {
    await openBook(page);
    await page.evaluate((t) => setTheme(t), theme);
    await choose(page, '15 min');
    const c = await page.locator('#pSleepBtn').evaluate((b) => { const s = getComputedStyle(b); return [s.color, s.backgroundColor]; });
    expect(c[0]).not.toBe(c[1]);
    await page.click('#pSleepBtn');
    for (const b of await page.locator('#pSleepMenu button:visible').all()) {
      const s = await b.evaluate((x) => { const st = getComputedStyle(x); return [st.color, st.backgroundColor]; });
      expect(s[0]).not.toBe(s[1]);
    }
  });
}

test.describe('360 px', () => {
  test.use({ viewport: { width: 360, height: 800 }, hasTouch: true });
  test('the timer fits the phone layout with 44 px controls', async ({ page, backend }) => {
    await openBook(page);
    await page.click('#pSleepBtn');
    await page.locator('#pSleepMenu').getByRole('button', { name: '15 min' }).click();
    await page.click('#pSleepBtn');
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - 360,
      small: [...document.querySelectorAll('#playerCard button, #playerCard select')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.textContent),
      navRows: new Set([...document.querySelectorAll('.pnav > *')].filter((e) => e.offsetParent && !e.classList.contains('status')).map((e) => Math.round(e.getBoundingClientRect().top / 8))).size,
      chapterWidth: document.getElementById('pChapter').getBoundingClientRect().width,
    }));
    expect(r).toMatchObject({ overflow: 0, small: [], navRows: 1 });
    expect(r.chapterWidth).toBeGreaterThan(100);
  });
});
