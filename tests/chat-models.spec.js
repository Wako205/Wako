const { test, expect, login } = require('./support/backend');

test('chat offers Opus 5.5 and Fable 5.2 at medium reasoning; a removed saved model falls back to Opus', async ({ page, backend }) => {
  backend.on('chat_start', (b) => ({ jobId: 'j1', convId: b.convId }));
  backend.on('chat_run', () => ({ state: 'done', reply: 'Hi.', cost: 0.001, model: 'claude-test' }));
  await page.addInitScript(() => { sessionStorage.setItem('mp_preset', 'sonnet-fast'); });
  await login(page);
  await page.click('#tabChat');
  await expect(page.locator('#preset option')).toHaveText(['Opus 5.5, medium reasoning (default)', 'Fable 5.2, medium reasoning (strongest, about twice the cost)']);
  await expect(page.locator('#preset')).toHaveValue('opus-medium');
  await page.selectOption('#preset', 'fable-medium');
  await page.fill('#prompt', 'Hello');
  await page.click('#sendBtn');
  await expect.poll(() => backend.callsOf('chat_start').length).toBe(1);
  expect(backend.callsOf('chat_start')[0].preset).toBe('fable-medium');
});
