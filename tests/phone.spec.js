const { test, expect, login, openAudio } = require('./support/backend');

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test('no horizontal scrolling at 390 px on any tab', async ({ page, backend }) => {
  await login(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.click('#tabTools');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await openAudio(page);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('#themes')).toBeInViewport({ ratio: 1 });
});
