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
