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
