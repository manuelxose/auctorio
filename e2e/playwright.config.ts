import { defineConfig } from '@playwright/test';

const chromeBin = process.env.CHROME_BIN;

export default defineConfig({
  testDir: './specs',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://auctorio.com',
    ...(chromeBin
      ? { launchOptions: { executablePath: chromeBin, args: ['--no-sandbox'] } }
      : {}),
  },
});
