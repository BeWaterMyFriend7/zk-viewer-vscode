import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globalsPkg from "globals";

const globals = globalsPkg;

export default tseslint.config(
  {
    ignores: ["out/**", "node_modules/**", "dist/**", "media/**", ".vscode-test/**", ".tmp-ext-install/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  }
);
