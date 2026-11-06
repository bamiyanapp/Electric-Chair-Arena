import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      exclude: [
        'seed.js',
        'eslint.config.mjs',
        'vitest.config.js',
        // dev-standards/shared/lambda/配下からのsymlink。dev-standards自身の
        // テスト（opsAlertNotifier.test.js、node:test形式）で担保済みのため、
        // このリポジトリのカバレッジ計測対象には含めない
        'opsAlertNotifier.js',
        'clientErrorReporting.js',
        '**/node_modules/**',
        '**/dist/**',
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
