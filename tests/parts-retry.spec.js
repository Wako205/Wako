const { test, expect, login, openAudio } = require('./support/backend');

test('a failed or hung audio part is tried again, so the whole chapter loads', async ({ page, backend }) => {
  const seen = {};
  backend.on('audio_part', (b) => {
    const key = b.chapter + ':' + b.index; seen[key] = (seen[key] || 0) + 1;
    if (b.chapter === 0 && b.index === 1 && seen[key] === 1) return new Promise(() => {});          // hangs once
    if (b.chapter === 0 && b.index === 1 && seen[key] === 2) return { ok: false, error: 'Service invoked too many times' };
    return { data: backend.mp3.toString('base64') };
  });
  await login(page);
  await page.evaluate(() => { PART_TIMEOUT_MS = 1500; });
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s')).toHaveCount(6, { timeout: 20000 });          // both parts of chapter 1
  await expect.poll(() => page.evaluate(() => P.cache[0] && P.cache[0].parts), { timeout: 20000 }).toBe(2);
  expect(seen['0:1']).toBe(3);
  await expect(page.locator('#pStatus')).not.toHaveClass(/err/);
});
