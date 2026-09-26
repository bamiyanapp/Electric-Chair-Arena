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
];
