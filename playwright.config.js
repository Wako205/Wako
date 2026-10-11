// Browser tests for index.html. The backend is never contacted: every request to
// script.google.com is answered by tests/support/backend.js, CDN files are served
// from node_modules, and the browser cannot resolve any host name at all.
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        '--no-proxy-server',
        '--host-resolver-rules=MAP * ~NOTFOUND',          // a request that escapes the mocks fails instead of reaching a server
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
});
