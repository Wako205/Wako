const { test, expect, login, openAudio } = require('./support/backend');

const SHARED = {
  id: 'shared1', owner: 'bob', mine: false, kind: 'book', title: 'Bob\'s Book', created: '2026-09-02T10:00:00Z', state: 'done',
  voice: 'Kore', lang: 'en-US', chars: 2800,
  chapters: [{ title: 'Part 1', n: 2, chars: 1400, status: 'done' }, { title: 'Part 2', n: 2, chars: 1400, status: 'done' }],
  pos: null, marks: {},
};

test('shares and unshares an item of the own library', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  const book = page.locator('#library .libitem').first();
  await book.getByRole('button', { name: 'Share', exact: true }).click();
  await expect.poll(() => backend.callsOf('audio_share').length).toBe(1);
  expect(backend.callsOf('audio_share')[0]).toMatchObject({ id: 'book1', shared: true, token: 'tok-test' });
  await expect(book).toContainText('shared');
  await book.getByRole('button', { name: 'Unshare' }).click();
  await expect.poll(() => backend.callsOf('audio_share').length).toBe(2);
  expect(backend.callsOf('audio_share')[1]).toMatchObject({ id: 'book1', shared: false });
  await expect(book.getByRole('button', { name: 'Share', exact: true })).toBeVisible();
});

test('the shared library is hidden when nothing is shared', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  await expect(page.locator('#library .libitem')).toHaveCount(2);
  await expect(page.locator('#sharedCard')).toBeHidden();
});

test('lists items shared by others and plays them with the owner in every request', async ({ page, backend }) => {
  backend.shared = [SHARED, { ...SHARED, id: 'book1', owner: 'alice', mine: true, title: 'Own shared item' }];
  backend.on('audio_text', (b) => ({ texts: ['Shared text one.', 'Shared text two.'] }));
  await login(page);
  await openAudio(page);
  const rows = page.locator('#sharedLib .libitem');
  await expect(rows).toHaveCount(1);                       // the caller's own shared items are not repeated
  await expect(rows.first()).toContainText('Shared by bob');
  await expect(rows.first().getByRole('button', { name: 'Delete' })).toHaveCount(0);
  await expect(rows.first().getByRole('button', { name: /Share|Add chapters/ })).toHaveCount(0);
  await rows.first().getByRole('button', { name: 'Listen' }).click();
  await expect(page.locator('#pTitle')).toHaveText('Bob\'s Book');
  await expect.poll(() => backend.callsOf('audio_part').length).toBeGreaterThan(0);
  expect(backend.callsOf('audio_text')[0]).toMatchObject({ id: 'shared1', owner: 'bob' });
  backend.callsOf('audio_part').forEach((c) => expect(c).toMatchObject({ id: 'shared1', owner: 'bob' }));
});

test('own items are requested without an owner', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Listen' }).click();
  await expect.poll(() => backend.callsOf('audio_part').length).toBeGreaterThan(0);
  backend.callsOf('audio_part').forEach((c) => expect(c.owner).toBeUndefined());
});
