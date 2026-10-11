const { test, expect, login, openAudio } = require('./support/backend');

async function openBook(page) {
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s')).toHaveCount(6);
  await expect.poll(() => page.evaluate(() => document.getElementById('player').duration)).toBeGreaterThan(8);
}

for (const width of [1000, 390]) {
  test(`full screen reading shows only the text and a small bar at ${width} px`, async ({ page, backend }) => {
    await page.setViewportSize({ width, height: 800 });
    await openBook(page);
    await page.locator('#pRead').click();
    const card = page.locator('#playerCard');
    await expect(card).toHaveClass(/reading/);
    for (const id of ['#pTitle', '#pChapter', '#pMarks', '#dlAudioBtn', '#pJump']) await expect(page.locator(id)).toBeHidden();
    await expect(page.locator('#pText')).toBeVisible();
    await expect(page.locator('#pMini')).toBeVisible();
    // The text fills the window, and nothing scrolls sideways.
    const box = await card.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(width - 1);
    expect(box.height).toBeGreaterThanOrEqual(799);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    // Play and pause from the bar; the time and the slider follow playback.
    await page.locator('#mPlay').click();
    await expect.poll(() => page.evaluate(() => document.getElementById('player').currentTime)).toBeGreaterThan(1);
    await expect(page.locator('#mTime')).toHaveText(/^0:0[1-9] \/ 0:\d\d$/);
    await expect.poll(async () => Number(await page.locator('#mSeek').inputValue())).toBeGreaterThan(0);
    await page.locator('#mPlay').click();
    expect(await page.evaluate(() => document.getElementById('player').paused)).toBe(true);

    // Dragging the slider seeks.
    await page.locator('#mSeek').fill('800');
    await page.locator('#mSeek').dispatchEvent('change');
    const r = await page.evaluate(() => { const p = document.getElementById('player'); return p.currentTime / p.duration; });
    expect(r).toBeGreaterThan(0.75); expect(r).toBeLessThan(0.85);

    await page.locator('#mExit').click();
    await expect(card).not.toHaveClass(/reading/);
    await expect(page.locator('#pTitle')).toBeVisible();
    await expect(page.locator('#pMini')).toBeHidden();
  });
}

test('Escape leaves full screen reading, and closing the player leaves it too', async ({ page, backend }) => {
  await openBook(page);
  await page.locator('#pRead').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#playerCard')).not.toHaveClass(/reading/);
  await page.locator('#pRead').click();
  await page.evaluate(() => closePlayer());
  await expect(page.locator('#playerCard')).not.toHaveClass(/reading/);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});
