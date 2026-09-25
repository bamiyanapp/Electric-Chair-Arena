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
);
