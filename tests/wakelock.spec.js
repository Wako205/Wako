const { test, expect, login, openAudio } = require('./support/backend');

// A fake Screen Wake Lock that records requests and releases.
async function fakeWakeLock(page) {
  await page.addInitScript(() => {
    window.__wl = { held: 0, requests: 0 };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
      request: async () => {
        window.__wl.requests++; window.__wl.held++;
        const l = new EventTarget();
        l.release = async () => { window.__wl.held--; l.dispatchEvent(new Event('release')); };
        return l;
      },
    } });
  });
}
const held = (page) => page.evaluate(() => window.__wl.held);

test('keeps the screen on while audio plays, not while paused', async ({ page, backend }) => {
  await fakeWakeLock(page);
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect.poll(() => page.evaluate(() => document.getElementById('player').duration)).toBeGreaterThan(8);
  await expect(page.locator('#pAwake')).toBeChecked();
  expect(await held(page)).toBe(0);
  await page.evaluate(() => document.getElementById('player').play());
  await expect.poll(() => held(page)).toBe(1);
  await page.evaluate(() => document.getElementById('player').pause());
  await expect.poll(() => held(page)).toBe(0);

  // Switched off: no lock while playing; the choice is remembered.
  await page.locator('#pAwake').uncheck();
  await page.evaluate(() => document.getElementById('player').play());
  await page.waitForTimeout(300);
  expect(await held(page)).toBe(0);
  await page.evaluate(() => document.getElementById('player').pause());
  expect(await page.evaluate(() => localStorage.getItem('mp_awake'))).toBe('0');
});
