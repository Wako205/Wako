const { test, expect, login, openAudio } = require('./support/backend');

test('EN/中文 switch next to Log out: the interface turns Chinese and back, book text stays as it is', async ({ page, backend }) => {
  await login(page);
  await expect(page.locator('#langBtn')).toHaveText('中文/EN');
  await expect(page.locator('#langBtn .on')).toHaveText('EN');
  await openAudio(page);
  const title = await page.locator('#library .libitem .t').first().textContent();
  await page.click('#langBtn');
  await expect(page.locator('#langBtn')).toHaveText('中文/EN');                    // always both, so anyone can find it
  await expect(page.locator('#langBtn .on')).toHaveText('中文');
  await expect(page.locator('#logoutBtn')).toHaveText('退出登录');
  await expect(page.locator('#tabAudio')).toHaveText('PDF 转音频');
  await expect(page.locator('#tabTrans')).toHaveText('翻译');
  expect(await page.locator('#themes button').allTextContents()).toEqual(['护眼', '白天', '黑夜']);
  await expect(page.locator('#previewBtn')).toHaveText('试听');
  expect(await page.locator('#avoice option[value="az:zh-CN-YunxiNeural"]').textContent()).toBe('云希 Yunxi（男，叙述）');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('#library .libitem .t').first()).toHaveText(title);           // a title is content, not interface
  // Text the page sets later is translated as it appears.
  await page.click('#tabTrans');
  await page.fill('#trText', '');
  await page.click('#trBtn');
  await expect(page.locator('#trStatus')).toHaveText('没有可翻译的内容。');
  await expect(page.locator('#trText')).toHaveAttribute('placeholder', /粘贴文字/);
  // Remembered after a reload.
  await page.reload();
  await expect(page.locator('#langBtn .on')).toHaveText('中文');
  await expect(page.locator('#logoutBtn')).toHaveText('退出登录');
  await page.click('#langBtn');
  await expect(page.locator('#logoutBtn')).toHaveText('Log out');
  await expect(page.locator('#tabAudio')).toHaveText('PDF to audio');
  expect(await page.locator('#themes button').allTextContents()).toEqual(['Eye care', 'Day', 'Night']);
  await page.click('#tabAudio');
  await expect(page.locator('#previewBtn')).toHaveText('Preview');                 // no Chinese left in the English interface
  expect(await page.locator('#avoice option[value="az:zh-CN-YunxiNeural"]').textContent()).toBe('Yunxi (Chinese, male, narrative)');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the player text is never translated', async ({ page, backend }) => {
  await login(page);
  await page.click('#langBtn');
  await openAudio(page);
  await page.locator('#library .libitem').first().getByRole('button', { name: /收听|继续/ }).click();
  await expect(page.locator('#pText span.s').first()).toBeVisible();
  const txt = await page.locator('#pText').textContent();
  expect(txt).toMatch(/[A-Za-z]{4}/);
  expect(txt).not.toMatch(/[一-鿿]/);
});

test.describe('Chinese browser', () => {
  test.use({ locale: 'zh-CN' });
  test('the interface starts in English even when the browser language is Chinese', async ({ page, backend }) => {
    await login(page);
    await expect(page.locator('#langBtn .on')).toHaveText('EN');
    await expect(page.locator('#logoutBtn')).toHaveText('Log out');
    await page.click('#langBtn');
    await page.reload();
    await expect(page.locator('#logoutBtn')).toHaveText('退出登录');                 // a chosen language is kept
  });
});
