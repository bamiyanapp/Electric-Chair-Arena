import { configDefaults, defineConfig } from 'vitest/config';

import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    environment: 'jsdom',
    // e2e/配下はPlaywright（test:e2e）が実行するテストであり、vitestの
    // 収集対象から除外する（@playwright/testのtest/expectはvitestと
    // 互換性が無く、収集時にエラーになるため）。
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*'],
      exclude: [
        'src/app/layout.tsx',
        'src/app/globals.css',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
