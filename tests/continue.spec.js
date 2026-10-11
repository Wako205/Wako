const { test, expect, login, openAudio } = require('./support/backend');

const state = (page) => page.evaluate(() => {
  const p = document.getElementById('player');
  return { paused: p.paused, chapter: document.getElementById('pChapter').value };
});

test('at the end of a chapter, a next chapter still being converted is waited for, then played', async ({ page, backend }) => {
  test.setTimeout(60000);
  const book = backend.library[0];
  book.state = 'processing'; book.jobId = 'job-conv';
  book.chapters[2].status = 'queued'; book.chapters[2].n = 2;
  let ready = 0;
  backend.on('status', () => ({ state: 'running', progress: 'Synthesizing speech', ready: [2, 2, ready] }));
  backend.on('audio_part', (b) => (b.chapter === 2 && b.index >= ready ? { ok: false, error: 'Segment not ready yet' } : { data: backend.mp3.toString('base64') }));

  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect.poll(() => page.evaluate(() => document.getElementById('player').duration)).toBeGreaterThan(8);
  await page.selectOption('#pChapter', '1');
  await expect.poll(() => backend.callsOf('audio_text').map((c) => c.chapter)).toContain(1);
  await expect.poll(() => page.evaluate(() => document.getElementById('player').duration)).toBeGreaterThan(8);
  await page.evaluate(() => { const p = document.getElementById('player'); p.currentTime = p.duration - 0.4; p.play(); });

  // Chapter 3 is not skipped: the player waits for it.
  await expect(page.locator('#pStatus')).toContainText('Waiting for "Chapter 3" to be converted', { timeout: 10000 });
  expect((await state(page)).chapter).toBe('1');

  ready = 2;                                              // the conversion finishes chapter 3
  await expect.poll(async () => (await state(page)).chapter, { timeout: 20000 }).toBe('2');
  await expect.poll(async () => (await state(page)).paused).toBe(false);
  await expect(page.locator('#pStatus')).not.toContainText('Waiting');
  await page.evaluate(() => document.getElementById('player').pause());
});

test('choosing another chapter while waiting cancels the wait', async ({ page, backend }) => {
  test.setTimeout(60000);
  const book = backend.library[0];
  book.state = 'processing'; book.jobId = 'job-conv';
  book.chapters[2].status = 'queued'; book.chapters[2].n = 2;
  let ready = 0;
  backend.on('status', () => ({ state: 'running', progress: '', ready: [2, 2, ready] }));
  backend.on('audio_part', (b) => (b.chapter === 2 && b.index >= ready ? { ok: false, error: 'Segment not ready yet' } : { data: backend.mp3.toString('base64') }));

  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect.poll(() => page.evaluate(() => document.getElementById('player').duration)).toBeGreaterThan(8);
  await page.selectOption('#pChapter', '1');
  await expect.poll(() => page.evaluate(() => document.getElementById('player').duration)).toBeGreaterThan(8);
  await page.evaluate(() => { const p = document.getElementById('player'); p.currentTime = p.duration - 0.4; p.play(); });
  await expect(page.locator('#pStatus')).toContainText('Waiting for', { timeout: 10000 });
  await page.selectOption('#pChapter', '0');
  await expect.poll(() => page.evaluate(() => !!P.waitConv)).toBe(false);
  ready = 2;
  await page.waitForTimeout(9000);                        // one library poll later
  expect(backend.callsOf('audio_text').map((c) => c.chapter)).not.toContain(2);
});
