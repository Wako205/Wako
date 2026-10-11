// Background music in WebKit, the engine of Safari on iPhone. Desktop WebKit cannot show
// what iOS does with the screen locked; these tests check the parts that run in the page.
const { test, expect, login, openAudio, INDEX_URL } = require('../support/backend');

/** A tone as a WAV file (WebKit builds may lack an MP3 decoder). */
function toneWav(seconds, freq) {
  const sr = 22050, n = Math.round(seconds * sr), b = Buffer.alloc(44 + 2 * n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + 2 * n, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(2 * n, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(8000 * Math.sin(2 * Math.PI * freq * i / sr)), 44 + 2 * i);
  return b;
}

test('WebKit renders the generated music at the chosen level', async ({ page, backend }) => {
  await page.goto(INDEX_URL);
  const r = await page.evaluate(async () => {
    const y = await renderGeneratedSamples('cafe', 3), lv = setLevel(y, SPEECH_DB + MUSIC_LEVELS.normal);
    return { seconds: y.length / MUSIC_RATE, rmsDb: lv.rmsDb, size: wavBlob(y, MUSIC_RATE).size };
  });
  expect(r.seconds).toBeGreaterThan(150);
  expect(r.rmsDb).toBeCloseTo(-44, 1);
  expect(r.size).toBe(44 + 2 * Math.round(r.seconds * 22050));
});

test('WebKit plays two audio elements at the same time', async ({ page, backend }) => {
  await page.goto(INDEX_URL);
  await page.evaluate(async (b64) => {
    const y = await renderGeneratedSamples('rain', 1); setLevel(y, -30);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    window.__a = new Audio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));     // stands for the narration
    window.__b = new Audio(URL.createObjectURL(wavBlob(y, MUSIC_RATE)));                       // the music
    const b = document.createElement('button'); b.id = 'both'; b.textContent = 'Play both';
    b.onclick = () => { window.__a.play(); window.__b.play(); };
    document.body.prepend(b);
  }, toneWav(20, 220).toString('base64'));
  await page.click('#both');                                   // a real click, as iOS requires
  await expect.poll(() => page.evaluate(() => [__a.currentTime > 0.5, __b.currentTime > 0.5, !__a.paused, !__b.paused])).toEqual([true, true, true, true]);
  // Pausing one leaves the other playing.
  await page.evaluate(() => __a.pause());
  const t = await page.evaluate(() => __b.currentTime);
  await expect.poll(() => page.evaluate(() => __b.currentTime)).toBeGreaterThan(t + 0.3);
});

test('WebKit decodes and renders a file of "My music"', async ({ page, backend }) => {
  await page.goto(INDEX_URL);
  const r = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const y = await renderFileSamples(bytes.buffer), lv = setLevel(y, -44);
    return { seconds: y.length / MUSIC_RATE, rmsDb: lv.rmsDb };
  }, toneWav(3, 440).toString('base64'));
  expect(r.seconds).toBeCloseTo(3, 1);
  expect(r.rmsDb).toBeCloseTo(-44, 1);
});

test('WebKit: the music follows the narration in the player', async ({ page, backend }) => {
  backend.mp3 = toneWav(9, 220);                               // the mock serves WAV segments here
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
  await page.click('#pMusic');
  await page.check('#mOn');
  await page.locator('#pText span.s').nth(1).click();          // a tap on a sentence starts the narration
  await expect(page.locator('#mStatus')).toHaveText('Playing: Rain.', { timeout: 30000 });
  await expect.poll(() => page.evaluate(() => [!player.paused, !music.paused])).toEqual([true, true]);
  await page.evaluate(() => player.pause());
  await expect.poll(() => page.evaluate(() => music.paused)).toBe(true);
});
