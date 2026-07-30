import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ファイル並列実行下ではv8カバレッジの集計(複数ワーカー間のマージ)が
    // 不安定になり、同一コードに対してカバレッジ率が実行ごとに数ポイント
    // 変動することを確認した(issue #166作業時、functions 77%〜83%程度で変動し
    // 下記thresholdsを断続的に満たさなくなっていた)。CIでのカバレッジ判定を
    // 安定させるため、ファイル並列実行を無効化する。
    // 注意: この設定はテストファイル間でNodeのrequireキャッシュ(モジュール
    // レジストリ)を共有させる副作用があり、handler.jsをrequireする複数の
    // テストファイル(benchmark.test.js/commentary.test.js/handler.test.js)が
    // 順不同で実行された場合にCJSモック差し込みが効かなくなる問題が発生した。
    // 各ファイル側でhandler.jsのキャッシュエントリを明示的に削除・再require
    // させることで対処済み(該当ファイルのコメント参照)。
    fileParallelism: false,
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
        functions: 80,
        lines: 80,
      },
    },
  },
});
