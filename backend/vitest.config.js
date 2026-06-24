import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      exclude: [
        'seed.js',
        'eslint.config.mjs',
        'vitest.config.js',
        '**/node_modules/**',
        '**/dist/**',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 75,
        lines: 80,
      },
    },
  },
});
