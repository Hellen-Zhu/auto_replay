import { defineConfig } from '@playwright/test';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadConfig, launchOptions } = require('./core/config');

const cfg = loadConfig(__dirname);
const launch = launchOptions(cfg);

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  // The cases do not depend on each other: each creates its own trade and exports its own case file. So they can
  // run side by side, also inside one spec: npx playwright test --workers=4
  fullyParallel: true,
  // One at a time unless --workers says otherwise: the UAT environment is shared, and how it takes several sessions
  // of the same account at once is not known yet
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: cfg.baseUrl || undefined,
    headless: launch.headless,
    channel: launch.channel,
    launchOptions: { slowMo: launch.slowMo, executablePath: launch.executablePath, args: launch.args },
    trace: 'on',
    video: cfg.evidence?.video === true ? 'on' : 'off',
    screenshot: 'on',
  },
});
