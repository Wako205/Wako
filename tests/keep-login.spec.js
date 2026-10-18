// "Stay logged in on this device": off by default; when ticked the token is kept in localStorage
// (mp_token_keep) instead of this tab's sessionStorage. Mock backend only.
const { test, expect, INDEX_URL } = require('./support/backend');

async function loginForm(page, keep) {
  await page.goto(INDEX_URL);
  await expect(page.locator('#keepLogin')).not.toBeChecked();              // off by default
  await page.fill('#user', 'tester');
  await page.fill('#pass', 'secret');
  if (keep) await page.check('#keepLogin');
  await page.click('#loginBtn');
  await expect(page.locator('#appView')).toBeVisible();
}
const kept = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('mp_token_keep') || 'null'));

test('ticked: the session survives a reload and a new page in the same browser', async ({ page, context, backend }) => {
  await loginForm(page, true);
  expect(await kept(page)).toEqual({ token: 'tok-test', user: 'tester' });
  expect(await page.evaluate(() => sessionStorage.getItem('mp_token'))).toBeNull();   // kept instead, not as well
  await page.reload();
  await expect(page.locator('#appView')).toBeVisible();
  await expect(page.locator('#brand')).toHaveText('tester@Wako205');
  // A new page, as when the app is opened again from the Home Screen.
  const page2 = await context.newPage();
  await new (require('./support/backend').MockBackend)().attach(page2);
  await page2.goto(INDEX_URL);
  await expect(page2.locator('#appView')).toBeVisible();
  await expect(page2.locator('#brand')).toHaveText('tester@Wako205');
  await expect(page2.locator('#loginView')).toBeHidden();
});

test('not ticked: a new page needs a new login', async ({ page, context, backend }) => {
  await loginForm(page, false);
  expect(await kept(page)).toBeNull();
  await page.reload();
  await expect(page.locator('#appView')).toBeVisible();                      // the tab keeps its session as before
  const page2 = await context.newPage();
  await new (require('./support/backend').MockBackend)().attach(page2);
  await page2.goto(INDEX_URL);
  await expect(page2.locator('#loginView')).toBeVisible();
  await expect(page2.locator('#appView')).toBeHidden();
});

test('Log out removes the kept session', async ({ page, backend }) => {
  await loginForm(page, true);
  await page.click('#logoutBtn');
  expect(await kept(page)).toBeNull();
  await page.reload();
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('#keepLogin')).not.toBeChecked();
});

test('an expired kept token shows the login form, as now', async ({ page, backend }) => {
  await loginForm(page, true);
  backend.token = 'tok-renewed';                                              // the server no longer accepts the kept token
  await page.reload();
  await expect(page.locator('#loginView')).toBeVisible();
  expect(await kept(page)).toBeNull();
});

test.describe('phones', () => {
  test.use({ viewport: { width: 360, height: 800 }, hasTouch: true });
  test('the checkbox is a 44 px target and is translated', async ({ page, backend }) => {
    await page.goto(INDEX_URL);
    const box = await page.locator('label.keep').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await page.click('#langBtn');
    await expect(page.locator('label.keep')).toHaveText('在此设备上保持登录');
  });
});
