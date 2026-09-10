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
        // dev-standards/shared/ui/からのsymlink。V8カバレッジはシンボリック
        // リンクの実体パス（dev-standards配下）を基準に実行を記録するため、
        // includeのグロブが一致させるsrc/lib側のパスでは実際に呼び出して
        // いても常に0%と計測される（直接importして呼び出すテストを追加
        // しても変化しないことを確認済み）。実体はdev-standards側で
        // formatBuildTime.test.jsによりテスト済みのため、ここでは除外する。
        'src/lib/formatBuildTime.js',
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
