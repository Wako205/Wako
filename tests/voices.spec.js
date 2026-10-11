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

test('the allowances are shown as a column chart beside the conversion form', async ({ page, backend }) => {
  backend.on('audio_library', () => ({ items: JSON.parse(JSON.stringify(backend.library)), ttsUsed: 20000, ttsCap: 1030000,
                                       azReady: true, azUsed: 154000, azCap: 500000, s0Used: 200, s0Cap: 12000000, azTier: 's0', azUntil: new Date(2026, 10, 8).getTime() }));
  await page.setViewportSize({ width: 1100, height: 900 });
  await login(page);
  await openAudio(page);
  const bars = page.locator('#usageBars .ubar');
  await expect(bars).toHaveCount(3);
  await expect(bars.nth(0)).toHaveAttribute('aria-label', 'Google: 20k of 1,030k characters this month');
  await expect(bars.nth(1)).toContainText('31%');
  await expect(bars.nth(1)).toContainText('154k / 500k');
  await expect(bars.nth(2)).toContainText('Microsoft trial');
  const h = await bars.nth(1).locator('.fill').evaluate((e) => e.getBoundingClientRect().height / e.parentElement.getBoundingClientRect().height);
  expect(h).toBeGreaterThan(0.28); expect(h).toBeLessThan(0.34);
  await expect(page.locator('#usageNote')).toContainText('through 7 Nov 2026');
  // Beside the form on a wide screen.
  const form = await page.locator('#apdf').evaluate((e) => e.closest('.card').getBoundingClientRect());
  const chart = await page.locator('#usageCard').boundingBox();
  expect(chart.x).toBeGreaterThan(form.right - 1);
  expect(Math.abs(chart.y - form.top)).toBeLessThan(2);
});
