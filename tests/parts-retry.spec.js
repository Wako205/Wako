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

test('a damaged audio part (not base64, cut off) is fetched again; base64 with line breaks or URL-safe letters is accepted', async ({ page, backend }) => {
  const seen = {};
  const good = backend.mp3.toString('base64');
  backend.on('audio_part', (b) => {
    const key = b.chapter + ':' + b.index; seen[key] = (seen[key] || 0) + 1;
    if (b.chapter === 0 && b.index === 1 && seen[key] === 1) return { data: good.slice(0, 101) + '<html>' };   // damaged once
    if (b.chapter === 0 && b.index === 0) return { data: good.replace(/(.{76})/g, '$1\n').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
    return { data: good };
  });
  await login(page);
  await page.evaluate(() => { PART_TIMEOUT_MS = 1500; });
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect.poll(() => page.evaluate(() => P.cache[0] && P.cache[0].parts), { timeout: 20000 }).toBe(2);
  expect(seen['0:1']).toBe(2);
  await expect(page.locator('#pStatus')).not.toHaveClass(/err/);
  const [a, b] = await page.evaluate(() => [Array.from(P.cache[0].bufs[0]), Array.from(P.cache[0].bufs[1])]);
  expect(a).toEqual(b);                                             // the URL-safe, wrapped copy decodes to the same bytes
});
