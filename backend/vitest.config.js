import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ファイル並列実行下ではv8カバレッジの集計(複数ワーカー間のマージ)が
    // 不安定になり、同一コードに対してカバレッジ率が実行ごとに数ポイント
    // 変動することを確認した(issue #166作業時、functions 77%〜83%程度で変動し
    // 下記thresholdsを断続的に満たさなくなっていた)。
    //
    // 当初はfileParallelism: falseで対処したが、この設定はテストファイル間で
    // 環境(Nodeのrequireキャッシュを含む)自体を共有してしまう副作用があり、
    // handler.jsをrequireする複数のテストファイル(benchmark.test.js/
    // commentary.test.js/handler.test.js)の実行順序次第でCJSモック差し込みが
    // 効かなくなる問題が発生した(CIでのみ再現し、ローカルでは実行順序の違いに
    // より再現しなかった)。
    //
    // そのため、ファイル並列度(同時に走らせるワーカー数)のみを1に制限し、
    // isolate(既定でtrue、ファイルごとに独立した環境を保証する設定)は
    // 変更しない方式に切り替えた。これにより「1ワーカーでの逐次実行によるv8
    // カバレッジ集計の安定化」は維持しつつ、各テストファイルは引き続き
    // 独立した環境(requireキャッシュ含む)で実行される。
    maxWorkers: 1,
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
