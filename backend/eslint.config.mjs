import js from "@eslint/js";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  js.configs.recommended,
  sonarjs.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": "error",
      complexity: ["error", 15],
    },
  },
  {
    // AIプレイヤーの確率的な意思決定（椅子の選択・fictitious play等）で
    // Math.random()を使用する。セキュリティ非依存のゲームロジックのため
    // sonarjs/pseudo-random（S2245）は対象外とする
    files: ["handler.js", "nash.js"],
    rules: {
      "sonarjs/pseudo-random": "off",
    },
  },
  {
    // ゲームAI（ナッシュ均衡計算・キャラクターAIの意思決定）や試合結果処理の
    // 中核ロジックが現状の実測値で複雑度のしきい値(15)を超過している。
    // 安全な分割には設計検討を要するため、issue #331では対応せず
    // issue #352へ切り出した。実測値の最大（nash.jsのgetNashMove:
    // complexity 32 / cognitive-complexity 48、handler.jsの/save-matchハンドラ:
    // complexity 33 / cognitive-complexity 44）を上回らないラチェット方式の
    // しきい値を設定する。
    files: ["benchmark.js", "handler.js", "handler.test.js", "nash.js"],
    rules: {
      complexity: ["error", 35],
      "sonarjs/cognitive-complexity": ["error", 50],
    },
  },
];
