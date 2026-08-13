/* global process */

import { defineConfig, devices } from '@playwright/test';

// next.config.mjsのbasePath算出ロジックと一致させる必要がある
// （GitHub Actions上ではリポジトリ名がbasePathになるため、E2Eの
// アクセス先URLもこれに合わせないと404になる）。
const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
const repoName = isGithubActions && process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[1] : '';
const basePath = isGithubActions ? `/${repoName}` : '';
const port = 4173;
const baseURL = `http://localhost:${port}${basePath}/`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    [
      'monocart-reporter',
      {
        name: 'Electric Chair Arena E2E Report',
        outputFile: './monocart-report/index.html',
        coverage: {
          outputDir: './coverage',
          // Next.js自体のdev-overlay等（node_modules/next/src/配下）を含む
          // ランタイム同梱コードをカバレッジ対象から除外し、vitest側の
          // カバレッジ設定（vitest.config.tsのinclude: ['src/**/*']）と
          // スコープを揃える。
          sourceFilter: {
            '**/node_modules/**': false,
            'src/**': true,
          },
          reports: [['v8'], ['json-summary'], ['console-summary']],
        },
      },
    ],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
});
