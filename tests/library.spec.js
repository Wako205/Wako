const { test, expect, login, openAudio } = require('./support/backend');

test('lists the library with kind, chapters and resume point', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  const items = page.locator('#library .libitem');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0).locator('.t')).toHaveText('The Quiet Mill');
  await expect(items.nth(0)).toContainText('Book');
  await expect(items.nth(0)).toContainText('2/3 chapters');
  await expect(items.nth(0).getByRole('button', { name: 'Listen' })).toBeEnabled();
  await expect(items.nth(1).locator('.t')).toHaveText('Phonons in MoS2');
  await expect(items.nth(1)).toContainText('resume at 0:01');
  await expect(items.nth(1).getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(page.locator('#libUsage')).toHaveText('Speech used this month: 120k of 1,030k characters');
  expect(backend.callsOf('audio_library')[0].token).toBe('tok-test');
});

test('adds chapters of a book later without uploading it again', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  const book = page.locator('#library .libitem').first();
  await book.getByRole('button', { name: 'Add chapters' }).click();
  const panel = page.locator('.addpanel');
  await expect(panel).toBeVisible();
  const boxes = panel.locator('input[type=checkbox]');
  await expect(boxes.nth(0)).toBeChecked();
  await expect(boxes.nth(0)).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Convert selected' })).toBeDisabled();
  await boxes.nth(2).check();
  await expect(panel).toContainText('1.4k characters of speech');
  await panel.locator('select').selectOption('Puck');
  const before = backend.callsOf('audio_library').length;
  await panel.getByRole('button', { name: 'Convert selected' }).click();
  await expect(panel).toBeHidden();
  expect(backend.callsOf('audio_add')).toEqual([expect.objectContaining({ action: 'audio_add', id: 'book1', voice: 'Puck', selected: [2], token: 'tok-test' })]);
  expect(backend.callsOf('audio_library').length).toBeGreaterThan(before);
});

test('deletes an item after confirmation', async ({ page, backend }) => {
  await login(page);
  await openAudio(page);
  page.once('dialog', (d) => d.accept());
  await page.locator('#library .libitem').nth(1).getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('#library .libitem')).toHaveCount(1);
  expect(backend.callsOf('audio_delete')[0]).toMatchObject({ id: 'paper1' });
});
