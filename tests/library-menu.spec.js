// Library rows: Listen/Resume and Offline stay as buttons; Add chapters, Share/Unshare, Rename and
// Delete are in a "⋯" menu (More actions). Mock backend only.
const { test, expect, login, openAudio, rowAction } = require('./support/backend');

const book = (page) => page.locator('#library .libitem').first();
const more = (page) => book(page).getByRole('button', { name: 'More actions' });

test('the menu holds the less frequent actions; Escape, a tap outside and a choice close it', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  await expect(book(page).locator('.libacts > button')).toHaveText(['Listen', 'Offline']);
  await expect(book(page).locator('[role=menuitem]')).toHaveCount(4);                  // in the closed menu
  await expect(book(page).locator('[role=menu]')).toBeHidden();
  await more(page).click();
  await expect(more(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(book(page).getByRole('menu')).toBeVisible();
  await expect(book(page).getByRole('menuitem')).toHaveText(['Add chapters', 'Share', 'Rename', 'Delete']);
  await expect(book(page).getByRole('menuitem').first()).toBeFocused();
  // Escape closes and gives the focus back to the button.
  await page.keyboard.press('Escape');
  await expect(book(page).getByRole('menu')).toBeHidden();
  await expect(more(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(more(page)).toBeFocused();
  // A tap outside closes it.
  await more(page).click();
  await page.locator('#library').click({ position: { x: 2, y: 2 } });
  await expect(book(page).getByRole('menu')).toBeHidden();
  // Only one menu is open at a time.
  await more(page).click();
  await page.locator('#library .libitem').nth(1).getByRole('button', { name: 'More actions' }).focus();   // the open menu covers it on screen
  await page.keyboard.press('Enter');
  await expect(page.locator('#library .menu:visible')).toHaveCount(1);
  // A choice closes it.
  await (await rowAction(book(page), 'Rename')).click();
  await expect(page.locator('#library .menu:visible')).toHaveCount(0);
  await expect(book(page).getByRole('textbox', { name: 'New title' })).toBeFocused();
});

test('keyboard: arrow keys open the menu and move between items; Enter chooses', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  await more(page).focus();
  await page.keyboard.press('ArrowDown');
  await expect(book(page).getByRole('menuitem', { name: 'Add chapters' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(book(page).getByRole('menuitem', { name: 'Share' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(book(page).getByRole('menuitem', { name: 'Delete' })).toBeFocused();
  await page.keyboard.press('ArrowDown');                                   // wraps around
  await expect(book(page).getByRole('menuitem', { name: 'Add chapters' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(book(page).getByRole('menuitem', { name: 'Rename' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');                                       // Share
  await expect.poll(() => backend.callsOf('audio_share').length).toBe(1);
  await expect(page.locator('#library .menu:visible')).toHaveCount(0);
});

test('Delete keeps its confirmation', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  page.once('dialog', (d) => d.dismiss());
  await (await rowAction(book(page), 'Delete')).click();
  await page.waitForTimeout(200);
  expect(backend.callsOf('audio_delete')).toHaveLength(0);
  page.once('dialog', (d) => { expect(d.message()).toContain('The Quiet Mill'); d.accept(); });
  await (await rowAction(book(page), 'Delete')).click();
  await expect.poll(() => backend.callsOf('audio_delete').length).toBe(1);
  expect(backend.callsOf('audio_delete')[0]).toMatchObject({ id: 'book1' });
});

test('the menu is translated with the interface', async ({ page, backend }) => {
  await login(page);
  await page.click('#langBtn');
  await openAudio(page);
  const btn = book(page).locator('.more');
  await expect(btn).toHaveAttribute('aria-label', '更多操作');
  await btn.click();
  await expect(book(page).getByRole('menuitem')).toHaveText(['添加章节', '分享', '重命名', '删除']);
});

test.describe('390 px', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('one row of buttons per item, 44 px targets, no sideways scrolling', async ({ page, backend }) => {
    backend.library.push({ id: 'paper2', kind: 'paper', title: 'A second paper with a rather long title that wraps', created: '2026-08-16T09:00:00Z', state: 'done', chars: 900,
      chapters: [{ title: 'Paper', n: 2, chars: 900, status: 'done' }], pos: null, marks: {}, shared: Date.now() });
    await login(page);
    await openAudio(page);
    const rows = await page.locator('#library .libitem').evaluateAll((list) => list.map((r) => {
      const bs = [...r.querySelectorAll('.libacts button')].filter((b) => b.offsetParent);
      return { tops: [...new Set(bs.map((b) => Math.round(b.getBoundingClientRect().top)))].length, small: bs.filter((b) => b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44).length, n: bs.length };
    }));
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r).toEqual({ tops: 1, small: 0, n: r.n });
    expect(rows.map((r) => r.n)).toEqual([3, 3, 3]);                      // Listen, Offline, ⋯
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // The open menu fits the screen and its items are 44 px tall.
    await more(page).click();
    const m = await book(page).getByRole('menu').boundingBox();
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x + m.width).toBeLessThanOrEqual(390);
    for (const h of await book(page).getByRole('menuitem').evaluateAll((l) => l.map((b) => b.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
  });
});

test.describe('storage line', () => {
  test('shown in the browser, with the Home Screen hint', async ({ page, backend }) => {
    await login(page);
    await openAudio(page);
    await expect(page.locator('#offlineInfo')).toBeVisible();
    await expect(page.locator('#offlineInfo')).toContainText('iPhone: add to Home Screen to keep them.');
  });

  test('hidden on the Home Screen until something is saved offline', async ({ page, backend }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    await login(page);
    await openAudio(page);
    await expect(page.locator('#offlineInfo')).toBeHidden();
    await page.evaluate(() => { offIndex.set('tester||book1|0', { key: 'tester||book1|0', user: 'tester', owner: '', id: 'book1', c: 0, bytes: 1000 }); return renderStorage(); });
    await expect(page.locator('#offlineInfo')).toBeVisible();
    await expect(page.locator('#offlineInfo')).not.toContainText('Home Screen');
  });
});
