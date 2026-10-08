import { defineConfig } from '@playwright/test';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadConfig, launchOptions } = require('./core/config');

const cfg = loadConfig(__dirname);
const launch = launchOptions(cfg);

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  workers: 1, // UAT 环境有状态，按顺序跑更稳
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: cfg.baseUrl || undefined,
    headless: launch.headless,
    channel: launch.channel,
    launchOptions: { slowMo: launch.slowMo, executablePath: launch.executablePath, args: launch.args },
    trace: 'on',
    video: cfg.evidence?.video === false ? 'off' : 'on',
    screenshot: 'on',
  },
});
