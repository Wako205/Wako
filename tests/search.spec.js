const { test, expect, login, openAudio } = require('./support/backend');

// Two segments per chapter (the book fixture has n = 2 for chapters 1 and 2; chapter 3 is not converted).
const TEXTS = {
  0: ['The river ran slowly past the old mill. Nobody   noticed the lantern.', 'Raman spectra of MoS2 were measured. The film was uniform.'],
  1: ['第一句话。我们在实验室测量了ＭｏＳ２的拉曼 光谱。', '最后一句话很短。<img src=x onerror="window.__pwned=1">不是代码。'],
};

async function openBook(page, backend, texts = TEXTS) {
  backend.on('audio_text', (b) => {
    if (b.token !== 'tok-test') return { ok: false, error: 'Session expired. Please log in again.' };
    return { texts: texts[b.chapter] };
  });
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
}
async function search(page, q) {
  await page.fill('#pSearch', q);
  await page.press('#pSearch', 'Enter');
  await expect(page.locator('#pSearchInfo')).not.toHaveText(/^$|Searching/);
}
const hits = (page) => page.locator('#pResults button.hit');

test('finds matches in every converted chapter, ignoring case, width and white space', async ({ page, backend }) => {
  await openBook(page, backend);
  await search(page, 'mos2');
  await expect(page.locator('#pSearchInfo')).toHaveText('2 matches.');
  await expect(hits(page)).toHaveCount(2);
  await expect(hits(page).nth(0).locator('b')).toHaveText('Chapter 1');
  await expect(hits(page).nth(0).locator('mark')).toHaveText('MoS2');
  await expect(hits(page).nth(1).locator('b')).toHaveText('Chapter 2');
  await expect(hits(page).nth(1).locator('mark')).toHaveText('ＭｏＳ２');      // the original form is shown
  await expect(hits(page).nth(1)).toContainText('测量了ＭｏＳ２的拉曼 光谱');

  await search(page, '拉曼光谱');                                              // no space in the query, one in the text
  await expect(hits(page)).toHaveCount(1);
  await expect(hits(page).first().locator('mark')).toHaveText('拉曼 光谱');
  await search(page, 'ＮＯＢＯＤＹ noticed');                                   // full-width capitals, other spacing
  await expect(hits(page).first().locator('mark')).toHaveText('Nobody noticed');
  await search(page, '一句');
  await expect(page.locator('#pSearchInfo')).toHaveText('2 matches.');

  await search(page, 'zebra');
  await expect(page.locator('#pSearchInfo')).toHaveText('No results.');
  await expect(hits(page)).toHaveCount(0);
  // Each chapter's text was requested once, and never for the chapter that is not converted.
  expect(backend.callsOf('audio_text').map((c) => c.chapter).sort()).toEqual([0, 1]);
});

test('a result opens its chapter and plays from the matching sentence', async ({ page, backend }) => {
  await openBook(page, backend);
  await search(page, '最后一句');
  await hits(page).first().click();
  await expect(page.locator('#pChapter')).toHaveValue('1');
  await expect.poll(() => page.evaluate(() => !player.paused)).toBe(true);
  await expect(page.locator('#pText span.s.cur')).toHaveText('最后一句话很短。');
  expect(await page.evaluate(() => player.currentTime)).toBeGreaterThan(3);
  await page.evaluate(() => player.pause());

  // Back to a sentence in the open chapter.
  await search(page, 'second');
  await expect(page.locator('#pSearchInfo')).toHaveText('No results.');
  await search(page, 'film');
  await hits(page).first().click();
  await expect(page.locator('#pChapter')).toHaveValue('0');
  await expect(page.locator('#pText span.s.cur')).toHaveText('The film was uniform.');
  await page.evaluate(() => player.pause());
});

test('text from the server is shown as text in the results', async ({ page, backend }) => {
  await openBook(page, backend);
  await search(page, 'onerror');
  await expect(hits(page)).toHaveCount(1);
  await expect(hits(page).first()).toContainText('<img src=x onerror="window.__pwned=1">');
  expect(await page.locator('#pResults img').count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('lists at most 200 results and gives the total', async ({ page, backend }) => {
  const many = 'Mill. '.repeat(150);
  await openBook(page, backend, { 0: [many, many], 1: ['No match here.', 'None.'] });
  await search(page, 'mill');
  await expect(page.locator('#pSearchInfo')).toHaveText('300 matches, showing the first 200.');
  await expect(hits(page)).toHaveCount(200);
});

test('the search is cleared when the player closes and texts are forgotten at logout', async ({ page, backend }) => {
  await openBook(page, backend);
  await search(page, 'mill');
  await page.click('#pClose');
  await page.locator('#library .libitem').first().getByRole('button', { name: /Listen|Resume/ }).click();
  await expect(page.locator('#pSearch')).toHaveValue('');
  await expect(hits(page)).toHaveCount(0);
  await search(page, 'mill');
  expect(backend.callsOf('audio_text')).toHaveLength(2);                     // still in memory
  await page.click('#logoutBtn');
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: /Listen|Resume/ }).click();
  await search(page, 'mill');
  expect(backend.callsOf('audio_text').length).toBeGreaterThan(2);          // fetched again after logout
});

for (const theme of ['day', 'night', 'eye']) {
  test('results are readable in the ' + theme + ' theme', async ({ page, backend }) => {
    await openBook(page, backend);
    await page.evaluate((t) => setTheme(t), theme);
    await search(page, 'mos2');
    const c = await hits(page).first().evaluate((b) => {
      const m = b.querySelector('mark'), s = getComputedStyle(b), ms = getComputedStyle(m);
      return [s.color, s.backgroundColor, ms.color, ms.backgroundColor];
    });
    expect(c[0]).not.toBe(c[1]);
    expect(c[2]).not.toBe(c[3]);
    expect(c[3]).not.toBe(c[1]);                                              // the match stands out
  });
}

test.describe('360 px', () => {
  test.use({ viewport: { width: 360, height: 800 }, hasTouch: true });
  test('search fits the phone layout with 44 px controls', async ({ page, backend }) => {
    await openBook(page, backend);
    await search(page, 'mos2');
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - 360,
      small: [...document.querySelectorAll('#playerCard button, #playerCard input[type=search]')].filter((b) => b.offsetParent && b.getBoundingClientRect().height < 44).map((b) => b.id || b.textContent),
    }));
    expect(r).toEqual({ overflow: 0, small: [] });
  });
});

test('a result in a part that is still loading plays once the chapter is complete', async ({ page, backend }) => {
  backend.library[0].chapters[0].n = 4;
  const texts = ['Alpha one. Alpha two.', 'Beta one. Beta two.', 'Gamma one. Gamma two.', 'Delta target here. Delta two.'];
  let release;
  const gate = new Promise((r) => { release = r; });
  backend.on('audio_part', (b) => (b.chapter !== 0 || b.index < 2 ? { data: backend.mp3.toString('base64') } : gate.then(() => ({ data: backend.mp3.toString('base64') }))));
  await openBook(page, backend, { 0: texts, 1: TEXTS[1] });
  await expect.poll(() => page.evaluate(() => P && P.partial && P.partial.parts)).toBe(1);
  await search(page, 'target');
  await hits(page).first().click();
  await expect(page.locator('#pStatus')).toHaveText('Loading the rest of this chapter...');
  release();
  await expect(page.locator('#pText span.s.cur')).toHaveText('Delta target here.');
  await expect.poll(() => page.evaluate(() => !player.paused)).toBe(true);
  await page.evaluate(() => player.pause());
});

test('searching an item another account shared asks for its texts with the owner', async ({ page, backend }) => {
  backend.shared = [{
    id: 'shared1', owner: 'bob', mine: false, kind: 'book', title: 'Bob\'s Book', created: '2026-09-02T10:00:00Z', state: 'done',
    voice: 'Kore', lang: 'en-US', chars: 2800, pos: null, marks: {},
    chapters: [{ title: 'Part 1', n: 2, chars: 1400, status: 'done' }, { title: 'Part 2', n: 2, chars: 1400, status: 'done' }],
  }];
  backend.on('audio_text', (b) => ({ texts: b.chapter === 0 ? ['Shared river text.', 'More.'] : ['The shared lantern.', 'End.'] }));
  await login(page);
  await openAudio(page);
  await page.locator('#sharedLib .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
  await search(page, 'lantern');
  await expect(hits(page)).toHaveCount(1);
  await expect(hits(page).first().locator('b')).toHaveText('Part 2');
  backend.callsOf('audio_text').forEach((c) => expect(c).toMatchObject({ id: 'shared1', owner: 'bob' }));
  expect(backend.callsOf('audio_text').map((c) => c.chapter).sort()).toEqual([0, 1]);
});
