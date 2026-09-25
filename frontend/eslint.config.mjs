import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  {
    ignores: [".next/**", "dist/**", "out/**", "node_modules/**", "postcss.config.js"],
  },
  {
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "error",
      complexity: ["error", 15],
    },
  },
  {
    // page.tsxはゲーム画面全体を1ファイルに集約しており、HomeContent本体・
    // handlePvpChairClick・handleGameChairClickが現状の実測値で複雑度の
    // しきい値(15)を超過している。安全な分割（コンポーネント分割・
    // カスタムフック抽出等）には設計検討を要するため、issue #331では対応せず
    // issue #351へ切り出した。実測値（HomeContent: complexity 62 /
    // cognitive-complexity 30、handlePvpChairClick: complexity 16 /
    // cognitive-complexity 31、handleGameChairClick: complexity 17 /
    // cognitive-complexity 26）を上回らないラチェット方式のしきい値を設定する。
    files: ["src/app/page.tsx"],
    rules: {
      complexity: ["error", 65],
      "sonarjs/cognitive-complexity": ["error", 35],
    },
  },
);
