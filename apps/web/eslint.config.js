// Flat ESLint config for apps/web.
// Hard rule (design §9): a module may not import from another module —
// only `@sunpath/shared` and `@sunpath/ui` are allowed cross-package imports.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "dev-dist", "node_modules"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
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
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Module isolation — files inside src/modules/X must not reach into other
  // modules. Within their own module they should use relative imports, so ANY
  // `@/modules/*` alias import from a module file counts as cross-module.
  // The composition root (App.tsx, components/) is exempt — its job is to wire
  // modules together.
  {
    files: ["src/modules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*", "@/modules/*/**"],
              message:
                "Cross-module imports are forbidden. Use @sunpath/shared, @sunpath/ui, DB events, or relative imports within your own module.",
            },
          ],
        },
      ],
    },
  },
);
