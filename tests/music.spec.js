const { test, expect, login, openAudio, INDEX_URL } = require('./support/backend');
const { makeMp3 } = require('./support/media');

const st = (page) => page.evaluate(() => ({ player: !player.paused, music: !music.paused, src: music.getAttribute('src') || '', t: music.currentTime }));

async function openBook(page) {
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => player.duration)).toBeGreaterThan(8);
}
async function musicOn(page) {
  await page.click('#pMusic');
  await expect(page.locator('#pMusicPanel')).toBeVisible();
  await page.check('#mOn');
}

test('generated music is rendered at the chosen level below the speech, as a seamless loop', async ({ page, backend }) => {
  await page.goto(INDEX_URL);
  const r = await page.evaluate(async () => {
    const out = {};
    for (const k of ['rain', 'night', 'cafe']) {
      const y = await renderGeneratedSamples(k, 1), lv = setLevel(y, SPEECH_DB + MUSIC_LEVELS.normal);
      out[k] = { seconds: y.length / MUSIC_RATE, rmsDb: lv.rmsDb, peak: lv.peak, seam: Math.abs(y[0] - y[y.length - 1]) };
    }
    const a = await renderGeneratedSamples('rain', 1), b = await renderGeneratedSamples('rain', 2), c = await renderGeneratedSamples('rain', 1);
    let diff = 0, same = 0; for (let i = 0; i < a.length; i += 97) { diff += Math.abs(a[i] - b[i]); same += Math.abs(a[i] - c[i]); }
    out.seeds = { diff, same };
    return out;
  });
  for (const k of ['rain', 'night', 'cafe']) {
    expect(r[k].seconds).toBeGreaterThan(150);                   // a few minutes per rendering
    expect(r[k].seconds).toBeLessThan(300);
    expect(r[k].rmsDb).toBeCloseTo(-44, 1);                      // -24 dBFS speech, 20 dB below
    expect(r[k].peak).toBeLessThan(0.9);
    expect(r[k].seam).toBeLessThan(0.02);
  }
  expect(new Set(['rain', 'night', 'cafe'].map((k) => r[k].seconds.toFixed(1))).size).toBe(3);   // different tempi
  expect(r.seeds.same).toBe(0);                                   // the same seed renders the same music
  expect(r.seeds.diff).toBeGreaterThan(1);                        // the next seed is different music
});

test('the music starts, pauses and resumes with the narration and keeps going across chapters', async ({ page, backend }) => {
  await page.addInitScript(() => { window.__ac = 0; const A = window.AudioContext; window.AudioContext = function (...a) { window.__ac++; return new A(...a); }; });
  await openBook(page);
  await musicOn(page);
  await expect(page.locator('#pMusic')).toHaveClass(/on/);
  expect((await st(page)).music).toBe(false);                    // nothing plays before the narration
  await page.evaluate(() => player.play());
  await expect(page.locator('#mStatus')).toHaveText('Playing: Rain.', { timeout: 20000 });
  await expect.poll(async () => (await st(page)).music).toBe(true);
  await expect.poll(async () => (await st(page)).t).toBeGreaterThan(0.3);
  expect((await st(page)).src).toMatch(/^blob:/);

  await page.evaluate(() => player.pause());
  await expect.poll(async () => (await st(page)).music).toBe(false);
  const t = (await st(page)).t;
  await page.evaluate(() => player.play());
  await expect.poll(async () => (await st(page)).music).toBe(true);
  expect((await st(page)).t).toBeGreaterThanOrEqual(t - 0.05);  // resumed, not restarted

  // The lock-screen title stays the book's; lock-screen pause stops both.
  expect(await page.evaluate(() => navigator.mediaSession.metadata.title)).toBe('The Quiet Mill');
  // Across the end of a chapter the music does not stop.
  const src = (await st(page)).src;
  await page.evaluate(() => { player.currentTime = player.duration - 0.3; });
  await expect(page.locator('#pChapter')).toHaveValue('1');
  await expect.poll(async () => (await st(page)).player).toBe(true);
  expect(await st(page)).toMatchObject({ music: true, src });

  await page.click('#pClose');
  await expect.poll(async () => (await st(page)).music).toBe(false);
  expect(await page.evaluate(() => window.__ac)).toBe(0);         // no Web Audio while playing
});

test('a new rendering follows when one ends, and the level and style can be changed', async ({ page, backend }) => {
  await openBook(page);
  await musicOn(page);
  await page.evaluate(() => player.play());
  await expect(page.locator('#mStatus')).toHaveText('Playing: Rain.', { timeout: 20000 });
  await expect.poll(() => page.evaluate(() => !!mNextReady), { timeout: 20000 }).toBe(true);
  const first = (await st(page)).src;
  await page.evaluate(() => { music.currentTime = music.duration - 0.2; });
  await expect.poll(async () => (await st(page)).src).not.toBe(first);
  await expect.poll(async () => (await st(page)).music).toBe(true);

  await page.selectOption('#mLevel', 'quiet');
  await page.selectOption('#mPreset', 'night');
  await expect(page.locator('#mStatus')).toHaveText('Playing: Night.', { timeout: 20000 });
  expect(await page.evaluate(() => mTrack.rmsDb)).toBeCloseTo(-50, 1);
  await page.selectOption('#mLevel', 'louder');
  await expect.poll(() => page.evaluate(() => mTrack && Math.round(mTrack.rmsDb)), { timeout: 20000 }).toBe(-38);
  await page.uncheck('#mOn');
  await expect.poll(async () => (await st(page)).music).toBe(false);
  expect((await st(page)).player).toBe(true);                    // the narration goes on
  await page.evaluate(() => player.pause());
});

test('my music: files kept in this browser, played in order or shuffled at the chosen level, never uploaded', async ({ page, backend }) => {
  await openBook(page);
  await musicOn(page);
  await page.selectOption('#mSource', 'mine');
  await expect(page.locator('#mFiles')).toHaveText('No files yet.');
  const a = makeMp3({ bursts: 2, freq: 330 }), b = makeMp3({ bursts: 3, freq: 440 });
  await page.setInputFiles('#mAdd', [{ name: 'one.mp3', mimeType: 'audio/mpeg', buffer: a }, { name: 'two.mp3', mimeType: 'audio/mpeg', buffer: b }]);
  await expect(page.locator('#mFiles .mfile')).toHaveCount(2);
  await expect(page.locator('#mFiles .mname')).toHaveText(['one.mp3', 'two.mp3']);
  await page.evaluate(() => player.play());
  await expect(page.locator('#mStatus')).toHaveText('Playing: one.mp3.', { timeout: 20000 });
  expect(await page.evaluate(() => mTrack.rmsDb)).toBeCloseTo(-44, 1);
  await expect.poll(() => page.evaluate(() => !!mNextReady), { timeout: 20000 }).toBe(true);
  await page.evaluate(() => { music.currentTime = music.duration - 0.1; });
  await expect(page.locator('#mStatus')).toHaveText('Playing: two.mp3.');
  await page.evaluate(() => player.pause());
  // Nothing about the files went to the server.
  expect(backend.calls.filter((c) => JSON.stringify(c).includes('one.mp3'))).toEqual([]);
  // Removing a file.
  await page.locator('#mFiles .mfile').first().getByRole('button', { name: 'Remove one.mp3' }).click();
  await expect(page.locator('#mFiles .mname')).toHaveText(['two.mp3']);
  // Shuffle with one file plays it again and again.
  await page.selectOption('#mOrder', 'shuffle');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mp_music_tester')).order)).toBe('shuffle');
});

test('the choices are remembered per user in this browser, and logout stops the music', async ({ page, backend }) => {
  await openBook(page);
  await musicOn(page);
  await page.selectOption('#mPreset', 'cafe');
  await page.selectOption('#mLevel', 'quiet');
  await page.reload();
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: /Listen|Resume/ }).click();
  await page.click('#pMusic');
  await expect(page.locator('#mOn')).toBeChecked();
  await expect(page.locator('#mPreset')).toHaveValue('cafe');
  await expect(page.locator('#mLevel')).toHaveValue('quiet');
  await page.evaluate(() => player.play());
  await expect.poll(async () => (await st(page)).music, { timeout: 20000 }).toBe(true);
  await page.click('#logoutBtn');
  await expect.poll(async () => (await st(page)).music).toBe(false);
  await login(page, 'bob');
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: /Listen|Resume/ }).click();
  await page.click('#pMusic');
  await expect(page.locator('#mOn')).not.toBeChecked();
  await expect(page.locator('#mPreset')).toHaveValue('rain');
});

for (const theme of ['eye', 'day', 'night']) {
  test('music controls at 360 px in the ' + theme + ' theme', async ({ page, backend }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openBook(page);
    await page.evaluate((t) => setTheme(t), theme);
    await musicOn(page);
    await page.selectOption('#mSource', 'mine');
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - 360,
      small: [...document.querySelectorAll('#playerCard button, #playerCard select')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.id || b.textContent),
      rows: new Set([...document.querySelectorAll('.pset > *')].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 1).map((e) => Math.round(e.getBoundingClientRect().top / 8))).size,
      on: (() => { const s = getComputedStyle(document.getElementById('pMusic')); return [s.color, s.backgroundColor]; })(),
    }));
    expect(r).toMatchObject({ overflow: 0, small: [], rows: 1 });
    expect(r.on[0]).not.toBe(r.on[1]);
  });
}

test('quick changes of the choices end with the music of the last choice', async ({ page, backend }) => {
  await openBook(page);
  await musicOn(page);
  await page.evaluate(() => player.play());
  // Three changes while the first rendering is still running.
  await page.selectOption('#mPreset', 'night');
  await page.selectOption('#mLevel', 'louder');
  await page.selectOption('#mPreset', 'cafe');
  await expect(page.locator('#mStatus')).toHaveText('Playing: Café.', { timeout: 30000 });
  expect(await page.evaluate(() => Math.round(mTrack.rmsDb))).toBe(-38);
  await expect.poll(() => page.evaluate(() => !music.paused)).toBe(true);
  await page.evaluate(() => player.pause());
});
