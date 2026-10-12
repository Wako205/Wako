const fs = require('fs');
const path = require('path');
const { test, expect } = require('./support/backend');

test('the page names a Home Screen icon and a manifest, and the files exist', async ({ page, backend }) => {
  await page.goto(require('./support/backend').INDEX_URL || 'file://' + path.join(__dirname, '..', 'index.html'));
  const hrefs = await page.evaluate(() => ({
    apple: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'),
    manifest: document.querySelector('link[rel="manifest"]').getAttribute('href'),
    title: document.querySelector('meta[name="apple-mobile-web-app-title"]').content,
  }));
  expect(hrefs.title).toBe('Wako205');
  const root = path.join(__dirname, '..');
  expect(fs.existsSync(path.join(root, hrefs.apple))).toBe(true);
  const m = JSON.parse(fs.readFileSync(path.join(root, hrefs.manifest), 'utf8'));
  m.icons.forEach((i) => expect(fs.existsSync(path.join(root, i.src))).toBe(true));
  const png = fs.readFileSync(path.join(root, hrefs.apple));
  expect(png.readUInt32BE(16)).toBe(180);                       // width from the PNG header
});

test('the Home Screen guide is linked from the login screen and has its four annotated pictures', async ({ page, backend }) => {
  await page.goto(require('./support/backend').INDEX_URL);
  await expect(page.locator('#installLink')).toHaveAttribute('href', 'install/');
  await page.goto('file://' + path.join(__dirname, '..', 'install', 'index.html'));
  await expect(page.locator('li')).toHaveCount(5);
  const imgs = page.locator('li img');
  await expect(imgs).toHaveCount(4);
  for (let i = 0; i < 4; i++) expect(await imgs.nth(i).evaluate((e) => e.complete && e.naturalWidth)).toBeGreaterThan(300);
  expect(await page.locator('header img').evaluate((e) => e.naturalWidth)).toBe(180);
});
