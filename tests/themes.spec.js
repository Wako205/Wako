const { test, expect, INDEX_URL } = require('./support/backend');

const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('eye care is the default and listed first; white and night are kept after a reload', async ({ page, backend }) => {
  await page.goto(INDEX_URL);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('eye');
  expect(await bg(page)).toBe('rgb(246, 237, 214)');
  await expect(page.locator('#themes button.on')).toHaveText('护眼');
  expect(await page.locator('#themes button').allTextContents()).toEqual(['护眼', '白天', '黑夜']);

  for (const [label, theme, color] of [['黑夜', 'night', 'rgb(17, 18, 23)'], ['护眼', 'eye', 'rgb(246, 237, 214)']]) {
    await page.click('#themes button:text("' + label + '")');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);
    expect(await bg(page)).toBe(color);
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(theme);
    await expect(page.locator('#themes button.on')).toHaveText(label);
    expect(await bg(page)).toBe(color);
  }

  await page.click('#themes button:text("白天")');
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('mp_theme'))).toBe('day');
  expect(await bg(page)).toBe('rgb(255, 255, 255)');
});
