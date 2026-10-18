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


// The small music player next to the themes: the built-in lofi library (CC0 tracks in music/lofi/).
const fs = require('fs'), path = require('path');
const LOFI = path.resolve(__dirname, '..', 'music', 'lofi');
const tracks = () => JSON.parse(fs.readFileSync(path.join(LOFI, 'tracks.json'), 'utf8')).tracks;

test('the lofi tracks are in the site and listed in tracks.json', async () => {
  const list = tracks();
  expect(list.length).toBeGreaterThanOrEqual(17);
  for (const t of list) { expect(fs.existsSync(path.join(LOFI, t.file))).toBe(true); expect(t.title).toBeTruthy(); }
});

test('mini player: plays by itself at login, ❚❚ pauses, ▶ resumes, independent of the book', async ({ page, backend }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => { window.__ac = 0; const A = window.AudioContext; window.AudioContext = function (...a) { window.__ac++; return new A(...a); }; });
  const list = tracks();
  await login(page);
  await expect(page.locator('#miniMusic')).toBeVisible();
  await expect(page.locator('#mmTrack option')).toHaveCount(list.length + 1);
  await expect(page.locator('#mmTrack option').first()).toHaveText('♪ All lofi (' + list.length + ')');
  // Plays by itself after login.
  await expect(page.locator('#mStatus')).toHaveText(/^Playing: /, { timeout: 30000 });
  await expect.poll(async () => (await st(page)).music).toBe(true);
  await expect(page.locator('#mmPlay')).toHaveAttribute('aria-label', 'Pause music');
  await expect(page.locator('#mmPlay')).toHaveText('❚❚');
  await expect(page.locator('#mStatus')).toHaveText(/^Playing: /);

  // The book plays at the same time; pausing the book leaves the music on.
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect.poll(() => page.evaluate(() => player.duration)).toBeGreaterThan(8);
  await page.evaluate(() => player.play());
  await expect.poll(async () => { const s = await st(page); return s.player && s.music; }).toBe(true);
  expect(await page.evaluate(() => navigator.mediaSession.metadata.title)).toBe('The Quiet Mill');   // the lock screen shows the book
  await page.evaluate(() => player.pause());
  await page.waitForTimeout(300);
  expect((await st(page)).music).toBe(true);
  await page.click('#pClose');
  await page.waitForTimeout(300);
  expect((await st(page)).music).toBe(true);

  // Second tap: pause; the same track continues on the next tap.
  await page.click('#mmPlay');
  await expect.poll(async () => (await st(page)).music).toBe(false);
  await expect(page.locator('#mmPlay')).toHaveText('▶');
  const t = (await st(page)).t, src = (await st(page)).src;
  await page.click('#mmPlay');
  await expect.poll(async () => (await st(page)).music).toBe(true);
  expect(await st(page)).toMatchObject({ src });
  expect((await st(page)).t).toBeGreaterThanOrEqual(t - 0.05);
  expect(await page.evaluate(() => window.__ac)).toBe(0);         // no Web Audio while playing
  // Paused with ❚❚: after a reload it does not start by itself.
  await page.click('#mmPlay');
  await page.reload();
  await expect(page.locator('#mStatus')).toHaveText(/^Ready: /, { timeout: 30000 });
  expect((await st(page)).music).toBe(false);
  await expect(page.locator('#mmPlay')).toHaveText('▶');
});

test('the player\'s pause button pauses the music too; its play button does not start the music', async ({ page, backend }) => {
  test.setTimeout(90000);
  await login(page);
  await expect(page.locator('#mStatus')).toHaveText(/^Playing: /, { timeout: 30000 });
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect.poll(() => page.evaluate(() => player.duration)).toBeGreaterThan(8);
  await page.click('#pPlay');
  await expect.poll(async () => { const s = await st(page); return s.player && s.music; }).toBe(true);
  await page.click('#pPlay');                                  // pause the book
  await expect.poll(async () => { const s = await st(page); return !s.player && !s.music; }).toBe(true);
  await expect(page.locator('#mmPlay')).toHaveText('▶');
  await page.click('#pPlay');                                  // play the book: the music stays off
  await expect.poll(async () => (await st(page)).player).toBe(true);
  await page.waitForTimeout(500);
  expect((await st(page)).music).toBe(false);
  await page.click('#mmPlay');                                 // the music is started on its own
  await expect.poll(async () => (await st(page)).music).toBe(true);
});

test('choosing one song plays it, then the list continues in order; all tracks shuffle; the choice is per user', async ({ page, backend }) => {
  test.setTimeout(90000);
  const list = tracks();
  await login(page);
  await expect(page.locator('#mStatus')).toHaveText(/^Playing: /, { timeout: 30000 });
  await page.selectOption('#mmTrack', list[2].file);
  await expect(page.locator('#mStatus')).toHaveText('Playing: ' + list[2].title + '.', { timeout: 30000 });
  await expect.poll(async () => (await st(page)).music).toBe(true);
  // At the end of a chosen song the next song of the list follows, and the list shows it.
  await expect.poll(() => page.evaluate(() => !!mNextReady), { timeout: 30000 }).toBe(true);
  await page.evaluate(() => { music.currentTime = music.duration - 0.2; });
  await expect(page.locator('#mStatus')).toHaveText('Playing: ' + list[3].title + '.', { timeout: 10000 });
  await expect(page.locator('#mmTrack')).toHaveValue(list[3].file);
  // All tracks: at the end of one, the prepared next one starts.
  await page.selectOption('#mmTrack', 'all');
  await expect(page.locator('#mStatus')).toHaveText(/^Playing: /, { timeout: 30000 });
  await expect.poll(() => page.evaluate(() => !!mNextReady), { timeout: 30000 }).toBe(true);
  const first = (await st(page)).src;
  await page.evaluate(() => { music.currentTime = music.duration - 0.2; });
  await expect.poll(async () => (await st(page)).src).not.toBe(first);
  await expect.poll(async () => (await st(page)).music).toBe(true);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mp_music_tester')))).toMatchObject({ source: 'lofi', lofi: 'all' });

  // Logout stops the music and hides the player; another user has the default choice.
  await page.selectOption('#mmTrack', list[1].file);
  await page.click('#logoutBtn');
  await expect.poll(async () => (await st(page)).music).toBe(false);
  await expect(page.locator('#miniMusic')).toBeHidden();
  await login(page, 'bob');
  await expect(page.locator('#mmTrack')).toHaveValue('all');
  await expect(page.locator('#mmPlay')).toHaveText('❚❚');         // plays by itself for a new user too
  await page.click('#mmPlay');
});

test('after a media error the music tries the same track once more under a new address', async ({ page, backend }) => {
  test.setTimeout(90000);
  await login(page);
  await expect.poll(async () => (await st(page)).music, { timeout: 30000 }).toBe(true);
  const breakIt = () => page.evaluate(() => { URL.revokeObjectURL(music.src); music.load(); });
  const first = (await st(page)).src;
  await breakIt();
  await expect.poll(async () => (await st(page)).src).not.toBe(first);
  await expect.poll(async () => { const s = await st(page); return s.music && s.t > 0.3; }).toBe(true);
  expect(await page.evaluate(() => mTrack.retried)).toBe(true);
  const second = (await st(page)).src;
  await breakIt();
  await expect.poll(() => page.evaluate(() => !!(music.error && music.error.code))).toBe(true);
  expect((await st(page)).src).toBe(second);
  await page.click('#mmPlay');
});

for (const theme of ['eye', 'day', 'night']) {
  test('mini player at 360 px in the ' + theme + ' theme', async ({ page, backend }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await login(page);
    await page.evaluate((t) => setTheme(t), theme);
    await expect(page.locator('#miniMusic')).toBeVisible();
    await expect(page.locator('#mStatus')).toHaveText(/^Playing: /, { timeout: 30000 });
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - 360,
      small: [...document.querySelectorAll('#miniMusic button, #miniMusic select')].filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.id),
      on: (() => { const s = getComputedStyle(document.getElementById('mmPlay')); return [s.color, s.backgroundColor]; })(),
    }));
    expect(r).toMatchObject({ overflow: 0, small: [] });
    expect(r.on[0]).not.toBe(r.on[1]);
    await page.click('#mmPlay');
  });
}

test('the list starts over after its last song', async ({ page, backend }) => {
  test.setTimeout(90000);
  const list = tracks();
  await login(page);
  await page.selectOption('#mmTrack', list[list.length - 1].file);
  await expect(page.locator('#mStatus')).toHaveText('Playing: ' + list[list.length - 1].title + '.', { timeout: 30000 });
  await expect.poll(() => page.evaluate(() => !!mNextReady), { timeout: 30000 }).toBe(true);
  await page.evaluate(() => { music.currentTime = music.duration - 0.2; });
  await expect(page.locator('#mStatus')).toHaveText('Playing: ' + list[0].title + '.', { timeout: 10000 });
  await expect(page.locator('#mmTrack')).toHaveValue(list[0].file);
  await page.click('#mmPlay');
});

test('each visit starts with a random song, never the one the last visit began with', async ({ page, backend }) => {
  test.setTimeout(120000);
  await login(page);
  const firsts = [];
  for (let k = 0; k < 4; k++) {
    if (k) await page.reload();
    await expect(page.locator('#mStatus')).toHaveText(/^(Playing|Ready): /, { timeout: 30000 });
    firsts.push(await page.evaluate(() => JSON.parse(localStorage.getItem('mp_music_tester')).last));
  }
  for (let k = 1; k < firsts.length; k++) expect(firsts[k]).not.toBe(firsts[k - 1]);
  await page.click('#mmPlay');
});

test('"BGM with book": the music plays and pauses with the book; unbound, it is independent again', async ({ page, backend }) => {
  test.setTimeout(90000);
  await login(page);
  await expect.poll(async () => (await st(page)).music, { timeout: 30000 }).toBe(true);   // playing on its own after login
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect.poll(() => page.evaluate(() => player.duration)).toBeGreaterThan(8);
  await page.check('#pBgm');
  await expect.poll(async () => (await st(page)).music).toBe(false);                     // the book is paused: so is the music
  await page.click('#pPlay');
  await expect.poll(async () => { const s = await st(page); return s.player && s.music; }).toBe(true);
  await expect(page.locator('#mmPlay')).toHaveText('❚❚');
  await page.click('#pPlay');
  await expect.poll(async () => { const s = await st(page); return !s.player && !s.music; }).toBe(true);
  // The header button plays both together while bound.
  await page.click('#mmPlay');
  await expect.poll(async () => { const s = await st(page); return s.player && s.music; }).toBe(true);
  // Across the end of a chapter the music goes on.
  await page.evaluate(() => { player.currentTime = player.duration - 0.3; });
  await expect(page.locator('#pChapter')).toHaveValue('1');
  expect((await st(page)).music).toBe(true);
  await page.evaluate(() => player.pause());
  await expect.poll(async () => (await st(page)).music).toBe(false);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('mp_music_tester'))).bind).toBe(true);
  // Unbound: the music is independent again (it was switched on at login).
  await page.uncheck('#pBgm');
  await expect.poll(async () => (await st(page)).music).toBe(true);
  expect((await st(page)).player).toBe(false);
  await page.click('#mmPlay');
});
