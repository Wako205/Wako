const { test, expect, INDEX_URL } = require('./support/backend');

const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('white is the default; night and eye care are kept after a reload', async ({ page, backend }) => {
  await page.goto(INDEX_URL);
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBeNull();
  expect(await bg(page)).toBe('rgb(255, 255, 255)');
  await expect(page.locator('#themes button.on')).toHaveText('白天');

  for (const [label, theme, color] of [['黑夜', 'night', 'rgb(22, 23, 29)'], ['护眼', 'eye', 'rgb(246, 237, 214)']]) {
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
