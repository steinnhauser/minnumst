import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".*/**", "**/dist/**", "**/coverage/**", "api/**", "deploy/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["{web,admin}/{src,public}/**/*.{ts,tsx,js}"],
    languageOptions: { globals: globals.browser },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    files: [
      "**/*.mjs",
      "*.{js,ts}",
      "{web,admin}/vite.config.ts",
      "tools/**/*.ts",
    ],
    languageOptions: { globals: globals.node },
  },
  eslintConfigPrettier,
);
