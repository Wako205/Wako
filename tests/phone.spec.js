const { test, expect, login, openAudio } = require('./support/backend');

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Pixels the page is wider than the 390 px screen (measured without mobile zoom-out, which would hide it). */
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - 390);

test('no horizontal scrolling at 390 px in the Polish and Audio tabs and the player', async ({ page, backend }) => {
  await login(page);
  await page.click('#tabTools');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await openAudio(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // Opening the player scrolls it into view smoothly; scroll back up once that has settled.
  await expect.poll(() => page.evaluate(() => new Promise((r) => { const y = scrollY; setTimeout(() => r(scrollY === y), 200); }))).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('#themes')).toBeInViewport({ ratio: 1 });
});
