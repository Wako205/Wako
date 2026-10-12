const { test, expect, login, INDEX_URL } = require('./support/backend');

test('logs in, keeps the session on reload and clears it on logout', async ({ page, backend }) => {
  await login(page, 'alice');
  const call = backend.callsOf('login')[0];
  expect(call).toMatchObject({ action: 'login', username: 'alice', password: 'secret' });
  await expect(page.locator('#brand')).toHaveText('alice@Wako205');
  await expect(page.locator('#pass')).toHaveValue('');
  expect(await page.evaluate(() => sessionStorage.getItem('mp_token'))).toBe('tok-test');

  await page.reload();
  await expect(page.locator('#appView')).toBeVisible();
  await expect(page.locator('#loginView')).toBeHidden();

  await page.click('#logoutBtn');
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('#brand')).toHaveText('Wako205');
  expect(await page.evaluate(() => sessionStorage.getItem('mp_token'))).toBeNull();
  await page.reload();
  await expect(page.locator('#loginView')).toBeVisible();
});

test('shows the server error for a wrong password', async ({ page, backend }) => {
  await page.goto(INDEX_URL);
  await page.fill('#user', 'alice');
  await page.fill('#pass', 'wrong');
  await page.press('#pass', 'Enter');
  await expect(page.locator('#loginStatus')).toHaveText('Wrong username or password.');
  await expect(page.locator('#loginStatus')).toHaveClass(/err/);
  await expect(page.locator('#appView')).toBeHidden();
  expect(backend.callsOf('login')).toHaveLength(1);
});

test('an expired token returns to the login form', async ({ page, backend }) => {
  await login(page);
  backend.token = 'something-else';
  await page.click('#tabAudio');
  await expect(page.locator('#loginView')).toBeVisible();
});

test('PDF to audio is the first tab and opens after login; Chat is last', async ({ page, backend }) => {
  await login(page);
  expect(await page.locator('.tabs button:visible').allTextContents()).toEqual(['PDF to audio', 'Chat']);   // Polish / Review is hidden for now
  await expect(page.locator('#audioView')).toBeVisible();
  await expect(page.locator('#chatView')).toBeHidden();
  await expect(page.locator('#library .libitem').first()).toBeVisible();
});
