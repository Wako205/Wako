const { test, expect, login, openAudio } = require('./support/backend');

// Records the Media Session action handlers so the tests can press lock-screen buttons.
async function recordMediaSession(page) {
  await page.addInitScript(() => {
    window.__ms = {};
    const set = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession);
    navigator.mediaSession.setActionHandler = (name, fn) => { window.__ms[name] = fn; set(name, fn); };
  });
}
const press = (page, action, details) => page.evaluate(([a, d]) => window.__ms[a](Object.assign({ action: a }, d)), [action, details || {}]);
const state = (page) => page.evaluate(() => {
  const p = document.getElementById('player');
  return { t: p.currentTime, paused: p.paused, chapter: document.getElementById('pChapter').value };
});

async function openBook(page) {
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s')).toHaveCount(6);
  await expect.poll(() => page.evaluate(() => document.getElementById('player').duration)).toBeGreaterThan(8);
}

test('the next chapter is loaded in advance and starts without network at the end', async ({ page, backend }) => {
  await openBook(page);
  // Chapter 2 is downloaded while chapter 1 is open, without any user action.
  await expect.poll(() => backend.callsOf('audio_part').filter((c) => c.chapter === 1).length).toBe(2);
  const before = backend.calls.filter((c) => c.action === 'audio_part' || c.action === 'audio_text').length;
  await page.evaluate(() => { const p = document.getElementById('player'); p.currentTime = p.duration - 0.4; p.play(); });
  await expect.poll(async () => (await state(page)).chapter).toBe('1');
  await expect.poll(async () => (await state(page)).paused).toBe(false);
  await expect(page.locator('#pText span.s').first()).toHaveText('The first sentence opens the chapter.');
  expect(backend.calls.filter((c) => c.action === 'audio_part' || c.action === 'audio_text').length).toBe(before);
  // Chapter 3 is not converted, so nothing more is fetched; the last chapter stops at its end.
  expect(backend.callsOf('audio_text').map((c) => c.chapter)).not.toContain(2);
  await page.evaluate(() => document.getElementById('player').pause());
});

test('lock-screen metadata and controls', async ({ page, backend }) => {
  await recordMediaSession(page);
  await openBook(page);
  const meta = () => page.evaluate(() => { const m = navigator.mediaSession.metadata; return m && { title: m.title, artist: m.artist }; });
  expect(await meta()).toEqual({ title: 'The Quiet Mill', artist: 'Chapter 1' });
  for (const a of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto']) {
    expect(await page.evaluate((x) => typeof window.__ms[x], a)).toBe('function');
  }

  await press(page, 'play');
  await expect.poll(async () => (await state(page)).paused).toBe(false);
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('playing');
  await press(page, 'pause');
  await expect.poll(async () => (await state(page)).paused).toBe(true);
  expect(await page.evaluate(() => navigator.mediaSession.playbackState)).toBe('paused');

  // Next segment: from the first segment (about 4.3 s long) to the start of the second.
  await press(page, 'seekto', { seekTime: 1 });
  await press(page, 'nexttrack');
  const seg2 = (await state(page)).t;
  expect(seg2).toBeGreaterThan(4); expect(seg2).toBeLessThan(5);
  // Previous segment near the start of a segment goes to the one before; later in it, to its start.
  await press(page, 'previoustrack');
  await expect.poll(async () => (await state(page)).t).toBeLessThan(0.5);
  await press(page, 'seekto', { seekTime: seg2 + 3.5 });
  await press(page, 'previoustrack');
  await expect.poll(async () => Math.abs((await state(page)).t - seg2)).toBeLessThan(0.1);
  await press(page, 'seekforward', { seekOffset: 2 });
  await expect.poll(async () => (await state(page)).t).toBeGreaterThan(seg2 + 1.9);
  await press(page, 'seekbackward', { seekOffset: 1 });
  await expect.poll(async () => (await state(page)).t).toBeLessThan(seg2 + 1.1);

  // Next segment from the last segment opens the next chapter.
  await press(page, 'nexttrack');
  await expect.poll(async () => (await state(page)).chapter).toBe('1');
  await expect.poll(meta).toEqual({ title: 'The Quiet Mill', artist: 'Chapter 2' });
  await press(page, 'pause');

  await page.click('#pClose');
  expect(await meta()).toBeNull();
});

test('playback never goes through Web Audio, so it continues with the screen locked', async ({ page, backend }) => {
  await page.addInitScript(() => {
    window.__routed = 0;
    const orig = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function (el) { window.__routed++; return orig.call(this, el); };
  });
  await openBook(page);
  await expect(page.locator('#pVol')).toHaveCount(0);
  await expect(page.locator('#pFollow')).toHaveCount(0);
  await expect(page.locator('#pronBox')).toHaveCount(0);
  await page.locator('#pText span.s').nth(1).click();
  await expect.poll(async () => (await state(page)).paused).toBe(false);
  expect(await page.evaluate(() => window.__routed)).toBe(0);
  await page.evaluate(() => player.pause());
});
