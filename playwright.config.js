// Browser tests for index.html. The backend is never contacted: every request to
// script.google.com is answered by tests/support/backend.js, CDN files are served
// from node_modules, and the browser cannot resolve any host name at all.
const { defineConfig, devices } = require('@playwright/test');

// Lets context.route() also answer requests made by the service worker (tests/offline.spec.js).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

module.exports = defineConfig({
  testDir: 'tests',
  // Chromium runs everything; WebKit (the engine of Safari) runs the tests in tests/webkit.
  projects: [
    { name: 'chromium', testIgnore: 'webkit/**' },
    { name: 'webkit', testMatch: 'webkit/**/*.spec.js', use: { ...devices['Desktop Safari'], launchOptions: { args: [] } } },
  ],
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
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',   // a request that escapes the mocks fails (except the local test server)
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
});
