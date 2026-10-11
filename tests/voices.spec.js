const { test, expect, login, openAudio } = require('./support/backend');

test('Microsoft voices are hidden until the server has them configured', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  await expect(page.locator('#azVoices')).toBeHidden();
  expect(await page.locator('#azVoices').evaluate((g) => g.disabled)).toBe(true);
  await expect(page.locator('#libUsage')).not.toContainText('Microsoft');
});

test('Microsoft voices: listed, counted against their own allowance, sent to the server', async ({ page, backend }) => {
  backend.on('audio_library', () => ({ items: JSON.parse(JSON.stringify(backend.library)), ttsUsed: 120000, ttsCap: 1030000,
                                       azReady: true, azUsed: 20000, azCap: 500000 }));
  await login(page);
  await openAudio(page);
  expect(await page.locator('#azVoices').evaluate((g) => g.disabled)).toBe(false);
  await expect(page.locator('#libUsage')).toContainText('Microsoft 20k of 500k characters');
  await page.selectOption('#avoice', 'az:zh-CN-YunxiNeural');

  // Adding chapters to a book with a Microsoft voice shows the Microsoft allowance.
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Add chapters' }).click();
  const panel = page.locator('.addpanel');
  const sel = panel.locator('select');
  await sel.selectOption('az:zh-CN-XiaoxiaoNeural');
  await panel.locator('.chlist input:not([disabled])').first().check();
  await expect(panel).toContainText('of 500k characters');
  await panel.getByRole('button', { name: 'Convert selected' }).click();
  await expect.poll(() => backend.callsOf('audio_add').length).toBe(1);
  expect(backend.callsOf('audio_add')[0].voice).toBe('az:zh-CN-XiaoxiaoNeural');
});

test('Microsoft: free tier first, then the trial credit, with a clear end date', async ({ page, backend }) => {
  const until = new Date(2026, 10, 8).getTime();   // midnight local time starting 8 Nov 2026
  backend.on('audio_library', () => ({ items: JSON.parse(JSON.stringify(backend.library)), ttsUsed: 0, ttsCap: 1030000,
                                       azReady: true, azUsed: 499000, azCap: 500000, s0Used: 200, s0Cap: 12000000, azTier: 's0', azUntil: until }));
  await login(page);
  await openAudio(page);
  await expect(page.locator('#libUsage')).toContainText('Microsoft free 499k of 500k, then trial credit 0.2k of 12,000k characters');
  await expect(page.locator('#libUsage')).toContainText('(through 7 Nov 2026)');
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Add chapters' }).click();
  const panel = page.locator('.addpanel');
  await panel.locator('select').selectOption('az:zh-CN-YunxiNeural');
  await panel.locator('.chlist input:not([disabled])').first().check();
  await expect(panel).toContainText('1k of 500k free, then 12,000k trial credit (the trial credit will be used for 0.4k)');
  await expect(panel).not.toContainText('not enough');
});
