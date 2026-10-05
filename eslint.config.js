import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `dist` alone is cwd-relative in flat config, so it stopped covering build
  // output once `packages/*` became workspaces (Fase B). `**/dist` covers both
  // the app's own `dist/` and every `packages/*/dist/`.
  { ignores: ["**/dist", "storybook-static", "apps/mobile/.expo", "apps/mobile/dist-ios", "apps/mobile/expo-env.d.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // ⚠️ `no-unused-vars` is OFF above, repo-wide. In `e2e/` that default is not
    // a style preference — it hides a specific, measured failure.
    //
    // `lesson-completion-unlock.spec.ts` declared `completeCurrentLesson()` and
    // never called it. The test was named "finishing lesson 1 marks it done and
    // unlocks lesson 2"; the body only asserted on progress rows written weeks
    // earlier. It was green every day while settling no attempt, and it would
    // have stayed green if the whole write path had been deleted. A full suite
    // run against production on 2026-08-13 moved exactly one table in the entire
    // `itera` schema (`class_sessions`, +3) and wrote zero learner rows.
    //
    // In a spec file an unused helper is therefore evidence of a specific bug:
    // the test declares work it does not perform, and the name outruns the body.
    // That is worth failing the lint over here even though it is not worth it in
    // application code.
    //
    // `^_` stays exempt: a deliberately discarded destructuring slot (e.g.
    // `const [, _dropped] = …` in `support/activityFixtures.ts`) is naming a
    // value on purpose, not forgetting one.
    files: ["e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
);
