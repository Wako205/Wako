const { test, expect, login, INDEX_URL } = require('./support/backend');

test('Admin tab: only for an admin account, lists every account with logins and usage', async ({ page, backend }) => {
  backend.admin = true;
  await login(page);
  await expect(page.locator('#tabAdmin')).toBeVisible();
  await page.click('#tabAdmin');
  await expect(page.locator('#adminStatus')).toHaveText(/^2 accounts · updated/);
  const rows = page.locator('#adminTable tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1).locator('td').first()).toHaveText('tester ★');          // most recently active first
  await expect(rows.nth(1).locator('td').nth(1)).toHaveText('1 h ago');
  await expect(rows.nth(1).locator('td').nth(2)).toHaveText('4');
  await expect(rows.nth(1).locator('td').nth(4)).toContainText('$1.23');
  await expect(rows.nth(2).locator('td').first()).toContainText('2 failed logins today');
  await expect(page.locator('#adminPools')).toContainText('Google trial');
  // Chinese interface: labels translated, account names left alone.
  await page.click('#langBtn');
  await expect(page.locator('#tabAdmin')).toHaveText('后台');
  await expect(rows.nth(0).locator('th').nth(1)).toHaveText('最近登录');
  await expect(rows.nth(1).locator('td').nth(1)).toHaveText('1 小时前');
  await expect(rows.nth(2).locator('td').first()).toContainText('今天登录失败 2 次');
  await expect(rows.nth(1).locator('td').first()).toContainText('tester ★');
});

test('Admin tab stays hidden for other accounts', async ({ page, backend }) => {
  await login(page);
  await expect(page.locator('#tabAudio')).toBeVisible();
  await expect(page.locator('#tabAdmin')).toBeHidden();
  expect(backend.calls.some((c) => c.action === 'admin_stats')).toBe(false);
});

test('a session without the admin flag (from before login returned it) shows no Admin tab and asks nothing', async ({ page, backend }) => {
  backend.admin = true;
  await login(page);
  await page.evaluate(() => localStorage.removeItem('mp_admin_tester'));
  await page.goto(INDEX_URL);
  await expect(page.locator('#appView')).toBeVisible();
  await expect(page.locator('#tabAdmin')).toBeHidden();                       // shown again after the next login
  expect(backend.calls.filter((c) => c.action === 'admin_stats')).toHaveLength(0);
});
