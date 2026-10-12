const { test, expect, login, openAudio } = require('./support/backend');

test('deletes the audio of one chapter after an inline confirmation', async ({ page, backend }) => {
  let dialogs = 0;
  page.on('dialog', (d) => { dialogs++; d.dismiss(); });
  await login(page);
  await openAudio(page);
  const book = page.locator('#library .libitem').first();
  await expect(book).toContainText('2/3 chapters');
  await book.getByRole('button', { name: 'Add chapters' }).click();
  const panel = page.locator('.addpanel');
  const dels = panel.getByRole('button', { name: /^Delete audio of / });
  await expect(dels).toHaveCount(2);                       // only converted chapters

  // Cancel keeps everything.
  await dels.first().click();
  await panel.getByRole('button', { name: 'Cancel' }).click();
  expect(backend.callsOf('audio_chapter_delete')).toHaveLength(0);
  await expect(panel.locator('input[type=checkbox]').first()).toBeChecked();

  await dels.first().click();
  await panel.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(panel).toBeHidden();
  expect(backend.callsOf('audio_chapter_delete')).toEqual([expect.objectContaining({ id: 'book1', chapter: 0, token: 'tok-test' })]);
  await expect(book).toContainText('1/3 chapters');
  expect(dialogs).toBe(0);

  // The deleted chapter can be ticked again for conversion.
  await book.getByRole('button', { name: 'Add chapters' }).click();
  await expect(panel.locator('input[type=checkbox]').first()).toBeEnabled();
  await expect(panel.locator('input[type=checkbox]').first()).not.toBeChecked();
});

test('shows the server error when a chapter cannot be deleted', async ({ page, backend }) => {
  backend.on('audio_chapter_delete', () => ({ ok: false, error: 'Wait until the conversion has finished' }));
  await login(page);
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: 'Add chapters' }).click();
  const panel = page.locator('.addpanel');
  await panel.getByRole('button', { name: /^Delete audio of / }).first().click();
  await panel.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(panel).toContainText('Wait until the conversion has finished');
  await expect(panel.getByRole('button', { name: /^Delete audio of / })).toHaveCount(2);
});

test('a book with every chapter converted still offers its chapters for deletion', async ({ page, backend }) => {
  backend.library[0].chapters.forEach((c) => { c.status = 'done'; c.n = c.n || 2; });
  await login(page);
  await openAudio(page);
  const book = page.locator('#library .libitem').first();
  await expect(book.getByRole('button', { name: 'Add chapters' })).toHaveCount(0);
  await book.getByRole('button', { name: 'Chapters', exact: true }).click();
  await expect(page.locator('.addpanel').getByRole('button', { name: /^Delete audio of / })).toHaveCount(3);
});
