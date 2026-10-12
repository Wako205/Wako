// The design rules of the page (docs/CLOUD_TASKS3.md, task G): one type scale, one spacing scale,
// controls of one height, one icon style, aligned left edges, tabular numbers and readable contrast.
const { test, expect, login, openAudio } = require('./support/backend');

const SIZES = [12, 14, 16, 20];
const SPACING = [0, 4, 8, 12, 16, 24];

/** Opens the audio tab with the library, the shared library and the player with its panels. */
async function fullPlayer(page, backend) {
  backend.shared = [{ id: 'sh1', owner: 'alice', kind: 'book', title: '活着', state: 'done', voice: 'Kore', lang: 'zh-CN', chars: 2800,
    chapters: [{ title: '第一章', n: 2, chars: 1400, status: 'done' }], pos: null, marks: {} }];
  await login(page);
  await openAudio(page);
  await expect(page.locator('#sharedLib .libitem')).toHaveCount(1);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
  await page.click('#pSleepBtn');
  await page.fill('#pSearch', 'sentence');
  await page.click('#pSearchBtn');
  await expect(page.locator('#pResults .hit').first()).toBeVisible();
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Add chapters' }).click();
  await page.locator('#library .libitem').nth(1).getByRole('button', { name: 'Offline' }).click();
}

/** Font sizes and weights of every visible element that holds text, and spacing values off the scale. */
const audit = (page) => page.evaluate(([spacing]) => {
  const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
  const sizes = new Set(), weights = new Set(), offScale = [];
  for (const e of document.querySelectorAll('main *, main')) {
    if (!vis(e) || e.closest('svg, audio')) continue;
    const s = getComputedStyle(e);
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName);
    if (own) { sizes.add(parseFloat(s.fontSize)); weights.add(s.fontWeight); }
    if (e.closest('.md, .readtext')) continue;
    for (const k of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'rowGap', 'columnGap']) {
      const v = Math.abs(parseFloat(s[k]) || 0);
      if (!spacing.includes(v) && !(e.tagName === 'BUTTON' && k.startsWith('margin')) && !(e.tagName === 'INPUT' && e.type === 'range'))
        offScale.push((e.id || e.className || e.tagName) + ' ' + k + ' ' + v);
    }
  }
  return { sizes: [...sizes].sort((a, b) => a - b), weights: [...weights].sort(), offScale };
}, [SPACING]);

for (const [width, ctl] of [[1280, 36], [390, 44]]) {
  test.describe(width + ' px', () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 600 });

    test('four font sizes, two weights, and spacing on the scale', async ({ page, backend }) => {
      await page.goto(require('./support/backend').INDEX_URL);
      const views = [await audit(page)];
      await fullPlayer(page, backend);
      views.push(await audit(page));
      await page.evaluate(() => { const b = document.getElementById('tabTools'); b.hidden = false; b.classList.remove('hidden'); });   // hidden for now; still checked
      await page.click('#tabTools'); views.push(await audit(page));
      await page.click('#tabChat'); views.push(await audit(page));
      for (const v of views) {
        for (const s of v.sizes) expect(SIZES, 'font size ' + s).toContain(s);
        expect(v.weights.every((w) => w === '400' || w === '600'), 'weights ' + v.weights).toBe(true);
        expect(v.offScale).toEqual([]);
      }
    });

    test('controls in a row share one height; icon buttons are labelled and use the same icon box', async ({ page, backend }) => {
      await fullPlayer(page, backend);
      const r = await page.evaluate(() => {
        const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
        const ctls = [...document.querySelectorAll('main button, main select, main input[type=text], main input[type=search], main input[type=password]')]
          .filter((e) => vis(e) && !e.closest('.tabs, .results, .pmini, details'));
        const icons = [...document.querySelectorAll('main svg.ic')].filter(vis);
        const iconOnly = [...document.querySelectorAll('main button')].filter((b) => vis(b) && !b.textContent.trim());
        return {
          heights: [...new Set(ctls.map((e) => Math.round(e.getBoundingClientRect().height)))],
          strokes: [...new Set(icons.map((i) => getComputedStyle(i).strokeWidth))],
          colorMatch: icons.every((i) => getComputedStyle(i).stroke === getComputedStyle(i.parentElement).color),
          unlabelled: iconOnly.filter((b) => !b.getAttribute('aria-label') || !b.querySelector('svg.ic')).map((b) => b.id || b.outerHTML.slice(0, 60)),
          small: iconOnly.map((b) => b.getBoundingClientRect()).filter((b) => Math.min(b.width, b.height) < (innerWidth < 600 ? 44 : 36)).length,
          iconCount: icons.length,
        };
      });
      expect(r.heights).toEqual([ctl]);
      expect(r.iconCount).toBeGreaterThan(10);
      expect(r.strokes).toEqual(['1.75px']);
      expect(r.colorMatch).toBe(true);
      expect(await page.locator('main svg.ic').evaluateAll((l) => [...new Set(l.filter((i) => i.getClientRects().length).map((i) => i.getBoundingClientRect().width + 'x' + i.getBoundingClientRect().height))])).toEqual(['20x20']);
      expect(r.unlabelled).toEqual([]);
      expect(r.small).toBe(0);
      // Icons for the actions named in the brief.
      for (const [sel, name] of [['#pPrev', 'prev'], ['#pNext', 'next'], ['#pClose', 'close'], ['#mmPlay', 'play'], ['#pSleepBtn', 'sleep'], ['#pSearchBtn', 'search'], ['#mPlay', 'play'], ['#mExit', 'close']])
        expect(await page.locator(sel + ' use').getAttribute('href'), sel).toBe('#i-' + name);
      const book = page.locator('#library .libitem').first();
      for (const [name, ic] of [['Listen', 'play'], ['Offline', 'offline'], ['Share', 'share'], ['Delete', 'delete']])
        expect(await book.getByRole('button', { name, exact: true }).locator('use').getAttribute('href')).toBe('#i-' + ic);
    });
  });
}

test('card edges, headings, lists and tabs share the left edge; numbers use tabular figures', async ({ page, backend }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fullPlayer(page, backend);
  const lefts = await page.evaluate(() => ['#brand', '.tabs', '#playerCard', '.genrow', '#audioView h2.sec', '#library .libitem', '#sharedLib .libitem', '#offlineInfo']
    .map((s) => [s, Math.round(document.querySelector(s).getBoundingClientRect().left)]));
  expect(new Set(lefts.map((x) => x[1])).size, JSON.stringify(lefts)).toBe(1);
  // Text inside the player card lines up with the card's own padding.
  const inner = await page.evaluate(() => ['#pTitle', '.pnav', '#player', '.pset', '#pMarks', '#pText'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().left)));
  expect(new Set(inner).size).toBe(1);
  for (const sel of ['.ubar .amt', '.ubar .pct', '#mTime', '#library .libitem .m', '#pSleepBtn .sl', '.addpanel .chlist .n'])
    expect(await page.locator(sel).first().evaluate((e) => getComputedStyle(e).fontVariantNumeric), sel).toBe('tabular-nums');
  expect(await page.locator('.addpanel .chlist .n').first().evaluate((e) => getComputedStyle(e).textAlign)).toBe('right');
});

test('reading text keeps its own line height and size; nothing smaller than 12 px', async ({ page, backend }) => {
  await fullPlayer(page, backend);
  const r = await page.evaluate(() => {
    const t = getComputedStyle(document.getElementById('pText')), b = getComputedStyle(document.body);
    return { read: [t.fontSize, parseFloat(t.lineHeight) / parseFloat(t.fontSize)], body: parseFloat(b.lineHeight) / parseFloat(b.fontSize) };
  });
  expect(r.read[0]).toBe('20px');
  expect(r.read[1]).toBeCloseTo(1.9, 2);
  expect(r.body).toBeCloseTo(1.5, 2);
});

/** WCAG contrast ratio of two CSS colors. */
function ratio(a, b) {
  const lum = (c) => { const [r, g, bl] = c.match(/\d+/g).slice(0, 3).map((x) => { const v = x / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

for (const theme of ['eye', 'day', 'night']) {
  test('text colors meet WCAG AA in the ' + theme + ' theme', async ({ page, backend }) => {
    await login(page);
    await page.evaluate((t) => setTheme(t), theme);
    const c = await page.evaluate(() => {
      const probe = document.createElement('div'); document.body.appendChild(probe);
      const get = (v) => { probe.style.color = 'var(--' + v + ')'; return getComputedStyle(probe).color; };
      const out = {}; for (const v of ['ink', 'muted', 'accent', 'err', 'pend', 'on-accent', 'bg', 'field', 'soft', 'hl', 'user']) out[v] = get(v);
      probe.remove(); return out;
    });
    const low = [];
    for (const fg of ['ink', 'muted', 'accent', 'err', 'pend']) for (const bg of ['bg', 'field', 'soft']) if (ratio(c[fg], c[bg]) < 4.5) low.push(fg + ' on ' + bg + ' ' + ratio(c[fg], c[bg]).toFixed(2));
    for (const bg of ['hl', 'user']) if (ratio(c.ink, c[bg]) < 4.5) low.push('ink on ' + bg);
    if (ratio(c['on-accent'], c.accent) < 4.5) low.push('on-accent on accent');
    expect(low).toEqual([]);
  });
}
