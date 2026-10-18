// The library appears at once after login from the copy saved in this browser (mp_lib_<user>),
// while audio_library and audio_public are requested together; a slow audio_library reply
// replaces the copy only when it differs. Mock backend only.
const { test, expect, INDEX_URL } = require('./support/backend');

const DELAY = 3000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** audio_library answered after DELAY ms with the mock library; records when it was asked and answered. */
function slowLibrary(backend) {
  const t = { asked: [], answered: [] };
  backend.on('audio_library', async () => {
    t.asked.push(Date.now());
    await sleep(DELAY);
    t.answered.push(Date.now());
    return { items: JSON.parse(JSON.stringify(backend.library)), ttsUsed: 120000, ttsCap: 1030000 };
  });
  return t;
}
const publicAsked = (backend) => {
  const t = [];
  backend.on('audio_public', () => { t.push(Date.now()); return { items: [] }; });
  return t;
};

/** Opens the page with a saved library for "tester" and logs in through the form. */
async function loginWithSnapshot(page, snapshot) {
  await page.goto(INDEX_URL);
  await page.evaluate((s) => localStorage.setItem('mp_lib_tester', JSON.stringify(s)), snapshot);
  await page.fill('#user', 'tester');
  await page.fill('#pass', 'secret');
  await page.click('#loginBtn');
  await expect(page.locator('#appView')).toBeVisible();
}

test('the saved library is shown at once; the slow reply replaces it when it differs', async ({ page, backend }) => {
  const lib = slowLibrary(backend), pub = publicAsked(backend);
  const saved = { items: [{ id: 'old1', kind: 'book', title: 'Saved Copy Book', created: '2026-01-01T00:00:00Z', state: 'done', chars: 1400,
    chapters: [{ title: 'Chapter 1', n: 2, chars: 1400, status: 'done' }], pos: null, marks: {} }], ttsUsed: 1000, ttsCap: 1030000, at: Date.now() - 60000 };
  await loginWithSnapshot(page, saved);
  const shownAt = Date.now();
  const items = page.locator('#library .libitem');
  // Within 300 ms: the saved copy, while audio_library is still waiting.
  await expect(items.first().locator('.t')).toHaveText('Saved Copy Book', { timeout: 300 });
  expect(lib.answered).toEqual([]);
  // audio_public was asked together with audio_library, not after its reply.
  await expect.poll(() => pub.length).toBe(1);
  expect(pub[0] - lib.asked[0]).toBeLessThan(DELAY / 2);
  // After about 3 s: the server's library.
  await expect(items.first().locator('.t')).toHaveText('The Quiet Mill', { timeout: DELAY + 2000 });
  await expect(items).toHaveCount(2);
  expect(Date.now() - shownAt).toBeGreaterThanOrEqual(DELAY - 500);
  expect(lib.answered.length).toBe(1);
  await expect(page.locator('#libUsage')).toHaveText('Speech used this month: 120k of 1,030k characters');
  // The new reply is the saved copy now.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mp_lib_tester')));
  expect(stored.items.map((x) => x.id)).toEqual(['book1', 'paper1']);
});

test('a reply equal to the saved copy does not draw the library again', async ({ page, backend }) => {
  const lib = slowLibrary(backend);
  const saved = { items: JSON.parse(JSON.stringify(backend.library)), ttsUsed: 120000, ttsCap: 1030000, at: Date.now() - 60000 };
  await loginWithSnapshot(page, saved);
  const first = page.locator('#library .libitem').first();
  await expect(first.locator('.t')).toHaveText('The Quiet Mill', { timeout: 300 });
  await first.evaluate((e) => { e.dataset.mark = 'kept'; });
  await expect.poll(() => lib.answered.length, { timeout: DELAY + 2000 }).toBe(1);
  await page.waitForTimeout(300);
  await expect(page.locator('#library .libitem').first()).toHaveAttribute('data-mark', 'kept');   // same element: not drawn again
});

test('without a saved copy the library appears with the reply; a late reply after logout is ignored', async ({ page, backend }) => {
  const lib = slowLibrary(backend);
  await page.goto(INDEX_URL);
  await page.fill('#user', 'tester'); await page.fill('#pass', 'secret'); await page.click('#loginBtn');
  await expect(page.locator('#appView')).toBeVisible();
  await expect(page.locator('#library')).toHaveText('Loading...');
  await expect(page.locator('#library .libitem .t').first()).toHaveText('The Quiet Mill', { timeout: DELAY + 2000 });
  // Log out while a new library request is still waiting: its reply must not show up for the next person.
  await page.evaluate(() => loadLibrary());
  await expect.poll(() => lib.asked.length).toBe(2);
  await page.click('#logoutBtn');
  await expect.poll(() => lib.answered.length, { timeout: DELAY + 2000 }).toBe(2);
  await page.waitForTimeout(300);
  await expect(page.locator('#library .libitem')).toHaveCount(0);
});
