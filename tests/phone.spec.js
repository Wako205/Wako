const { test, expect, login, openAudio } = require('./support/backend');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Pixels the page is wider than the 390 px screen (measured without mobile zoom-out, which would hide it). */
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - 390);

test('no horizontal scrolling at 390 px in the Chat and Audio tabs and the player', async ({ page, backend }) => {
  await login(page);
  await page.click('#tabChat');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await openAudio(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('#themes')).toBeInViewport({ ratio: 1 });
});
