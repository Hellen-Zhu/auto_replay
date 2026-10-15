import { defineConfig } from '@playwright/test';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadConfig, launchOptions } = require('./core/config');

const cfg = loadConfig(__dirname);
const launch = launchOptions(cfg);

// The company's Genie report (package genie-playwright, from the company npm mirror), added when it is installed:
//   npm install genie-playwright -D
// Without it the run uses only the list and HTML reports, so a machine without the mirror still works. Its options
// are those of the package's GenieReporterConfig (the type is not imported, so the type check passes without it).
const hasGenie = (() => {
  try { require.resolve('genie-playwright'); return true; } catch { return false; }
})();
const genie: [string, { displayName: string; labels: string[] }][] = hasGenie
  ? [['genie-playwright', { displayName: 'OREO UAT Replay', labels: ['playwright', 'oreo-uat'] }]]
  : [];

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  // The cases do not depend on each other: each creates its own trade and exports its own case file. So they can
  // run side by side, also inside one spec: npx playwright test --workers=4
  fullyParallel: true,
  // Playwright's default (half the CPU cores) unless --workers says otherwise; --workers=1 runs one at a time. On the
  // real system every case logs in with the same account: how it takes several sessions at once is not known yet
  workers: undefined,
  reporter: [['list'], ['html', { open: 'never' }], ...genie],
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
