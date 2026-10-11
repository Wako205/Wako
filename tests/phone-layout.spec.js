const { test, expect, login, openAudio } = require('./support/backend');
const { makeBookPdf } = require('./support/media');

test.use({ hasTouch: true });

/** Problems on the current screen: horizontal overflow, and visible controls lower than 44 px. */
const audit = (page, width) => page.evaluate((w) => {
  const small = [...document.querySelectorAll('button, select, input[type=text], input[type=password], summary')]
    .filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44)
    .map((b) => (b.id || b.textContent.trim().slice(0, 20)) + ': ' + Math.round(b.getBoundingClientRect().height) + ' px');
  return { overflow: Math.max(0, document.documentElement.scrollWidth - w), small };
}, width);

/** Distinct rows (top edges) of the visible controls in a container. */
const rows = (page, sel) => page.evaluate((s) => new Set([...document.querySelectorAll(s)].filter((e) => e.offsetParent && e.getBoundingClientRect().width > 1 && !e.classList.contains('status'))
  .map((e) => Math.round(e.getBoundingClientRect().top / 8))).size, sel);

for (const width of [360, 390, 430]) {
  test.describe(width + ' px', () => {
    test.use({ viewport: { width, height: 800 } });

    test('every tab fits the screen with 44 px controls', async ({ page, backend }) => {
      await login(page);
      expect(await audit(page, width)).toEqual({ overflow: 0, small: [] });
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator('#themes')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('.tabs')).toBeInViewport({ ratio: 1 });

      await page.click('#tabTools');
      expect(await audit(page, width)).toEqual({ overflow: 0, small: [] });

      await openAudio(page);
      expect(await audit(page, width)).toEqual({ overflow: 0, small: [] });
      await page.locator('#library .libitem').first().getByRole('button', { name: 'Add chapters' }).click();
      expect(await audit(page, width)).toEqual({ overflow: 0, small: [] });
    });

    test('player controls take two rows', async ({ page, backend }) => {
      await login(page);
      await openAudio(page);
      await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
      await expect(page.locator('#pText span.s').first()).toBeVisible();
      await page.locator('#pMarks .mark').nth(1).getByRole('button', { name: 'Save here' }).click();
      await page.evaluate(() => { P.item.pos = Object.assign({}, P.item.pos, { label: '那个老人跑到苗田正中扑地趴了下来，脸紧紧地贴在几株青苗之间的田地上' }); renderMarks(); });
      await expect(page.locator('#pMarks .mark').first().locator('.w')).toHaveText('那个老人跑到…');
      expect(await audit(page, width)).toEqual({ overflow: 0, small: [] });
      expect(await rows(page, '.pnav > *')).toBe(1);
      expect(await rows(page, '.pset > *')).toBe(1);
      // Chapter title readable in the selector.
      expect(await page.locator('#pChapter').evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(100);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator('#themes')).toBeInViewport({ ratio: 1 });
    });

    test('the chapter list of a new book is readable', async ({ page, backend }) => {
      await login(page);
      await page.click('#tabAudio');
      await page.setInputFiles('#apdf', { name: 'mill.pdf', mimeType: 'application/pdf', buffer: await makeBookPdf({ chapters: 4 }) });
      const labels = page.locator('#bookChapters label');
      await expect(labels).toHaveCount(4);
      expect(await audit(page, width)).toEqual({ overflow: 0, small: [] });
      for (const box of await labels.evaluateAll((ls) => ls.map((l) => {
        const t = l.children[1], n = l.querySelector('.n');
        return { h: l.getBoundingClientRect().height, titleFits: t.scrollWidth <= t.clientWidth + 1, nFits: n.scrollWidth <= n.clientWidth + 1, font: parseFloat(getComputedStyle(l).fontSize) };
      }))) {
        expect(box.h).toBeGreaterThanOrEqual(44);
        expect(box.titleFits && box.nFits).toBe(true);
        expect(box.font).toBeGreaterThanOrEqual(14);
      }
    });
  });
}
