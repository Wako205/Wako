// Small interface fixes (task M): chat reply actions as buttons, 44 px previous/next, tab labels on
// one line at 360 px, and a note plus slower polling for a conversion without progress. Mock backend only.
const { test, expect, login, openAudio } = require('./support/backend');

const reply = (backend) => {
  backend.on('chat_start', (b) => ({ jobId: 'j1', convId: b.convId }));
  backend.on('chat_run', () => ({ state: 'done', reply: 'A **short** reply.', cost: 0.001, model: 'claude-test' }));
};

test.describe('390 px', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('chat "Download .md" and "Copy" are buttons with 44 px targets', async ({ page, context, backend }) => {
    reply(backend);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await login(page);
    await page.click('#tabChat');
    await page.fill('#prompt', 'Hi');
    await page.click('#sendBtn');
    const meta = page.locator('.msg.assistant .meta').last();
    const dl = meta.getByRole('button', { name: 'Download .md' }), cp = meta.getByRole('button', { name: 'Copy' });
    await expect(dl).toBeVisible();
    await expect(meta.locator('a')).toHaveCount(0);
    for (const b of [dl, cp]) {
      await expect(b).toHaveClass(/ghost/);
      await expect(b).toHaveClass(/small/);
      expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    const [file] = await Promise.all([page.waitForEvent('download'), dl.click()]);
    expect(file.suggestedFilename()).toMatch(/^reply_\d+\.md$/);
    await cp.click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('A **short** reply.');
  });

  test('previous and next chapter are 44 px wide', async ({ page, backend }) => {
    await login(page);
    await openAudio(page);
    await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
    await expect(page.locator('#pText span.s').first()).toBeVisible();
    for (const id of ['#pPrev', '#pNext']) {
      const b = await page.locator(id).boundingBox();
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
  });
});

/** Every visible tab label on one line, and the tab bar no wider than the screen. */
const tabsOneLine = (page) => page.evaluate(() => {
  const tabs = [...document.querySelectorAll('.tabs button')].filter((b) => b.offsetParent);
  const lh = (b) => parseFloat(getComputedStyle(b).lineHeight) || parseFloat(getComputedStyle(b).fontSize) * 1.3;
  return { n: tabs.length, wrapped: tabs.filter((b) => b.scrollHeight > lh(b) * 1.5 + 16 + 4 || b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent),
    tops: new Set(tabs.map((b) => Math.round(b.getBoundingClientRect().top))).size, overflow: document.documentElement.scrollWidth - innerWidth };
});

test.describe('360 px', () => {
  test.use({ viewport: { width: 360, height: 800 }, hasTouch: true });

  test('all five tab labels fit on one line, in English and in Chinese', async ({ page, backend }) => {
    backend.admin = true;
    await login(page);
    await expect(page.locator('#tabAdmin')).toBeVisible();
    await expect(page.locator('#tabAudio')).toHaveText('Convert');
    await expect(page.locator('#tabAudio')).toHaveAttribute('title', 'PDF to audio');
    expect(await tabsOneLine(page)).toEqual({ n: 5, wrapped: [], tops: 1, overflow: 0 });
    await page.click('#langBtn');
    await expect(page.locator('#tabAudio')).toHaveText('转换');
    await expect(page.locator('#tabAudio')).toHaveAttribute('title', 'PDF 转音频');
    expect(await tabsOneLine(page)).toEqual({ n: 5, wrapped: [], tops: 1, overflow: 0 });
    // A wider window shows the full name again.
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(page.locator('#tabAudio')).toHaveText('PDF 转音频');
    await page.click('#langBtn');
    await expect(page.locator('#tabAudio')).toHaveText('PDF to audio');
  });
});

test('a conversion without progress for 10 min says so and is polled once a minute', async ({ page, backend }) => {
  test.setTimeout(120000);
  backend.library.unshift({ id: 'conv1', kind: 'book', title: 'Converting Book', created: '2026-10-01T10:00:00Z', state: 'processing', jobId: 'job-c1', chars: 2800,
    chapters: [{ title: 'Chapter 1', n: 4, chars: 1400, status: 'queued' }, { title: 'Chapter 2', n: 4, chars: 1400, status: 'queued' }], pos: null, marks: {} });
  let progress = 'Synthesizing speech: 3 of 8 segments';
  backend.on('status', () => ({ state: 'running', progress, ready: [0, 0] }));
  await page.clock.install();
  await login(page);
  await openAudio(page);
  const row = page.locator('#library .libitem').first(), note = row.locator('.stalled');
  const polls = () => backend.callsOf('status').filter((c) => c.jobId === 'job-c1').length;
  const run = async (ms, step) => { for (let t = 0; t < ms; t += step) { await page.clock.runFor(step); await page.waitForTimeout(15); } };
  // Every 8 s while there is progress; a changed text starts the 10 minutes again.
  await run(5 * 60 * 1000, 8000);
  expect(polls()).toBeGreaterThanOrEqual(30);
  progress = 'Synthesizing speech: 4 of 8 segments';
  await run(6 * 60 * 1000, 8000);
  await expect(note).toHaveCount(0);                                           // 6 min since the last change
  await run(5 * 60 * 1000, 8000);
  await expect(note).toHaveText('No progress for 10 min; the server keeps trying.');
  // From now on once a minute (the server restarts stalled jobs on these polls).
  const before = polls();
  await run(5 * 60 * 1000, 8000);
  expect(polls() - before).toBeGreaterThanOrEqual(4);
  expect(polls() - before).toBeLessThanOrEqual(6);
  // Progress again: the note goes and the 8 s polls return.
  progress = 'Synthesizing speech: 5 of 8 segments';
  await run(2 * 60 * 1000, 8000);
  await expect(note).toHaveCount(0);
  const b2 = polls();
  await run(80 * 1000, 8000);
  expect(polls() - b2).toBeGreaterThanOrEqual(8);
});
