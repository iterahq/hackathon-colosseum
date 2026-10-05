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
  {
    // PLAN ADR-9: the bridge handshake is the only "am I in the shell" test. A user-agent test and
    // the WebView channel (`ReactNativeWebView`, `webkit.messageHandlers`) belong to
    // packages/bridge alone (tests may fake the channel); everything else asks `startShellBridge()` in src/lib/shellBridge.ts.
    // Every way to name the property is covered: dot, computed (string or template), destructuring,
    // `in`, and `Reflect.get/has` with a literal. A type-level mention is not a read and is allowed.
    files: ["**/*.{ts,tsx}"],
    ignores: ["packages/bridge/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name=/^(userAgent|userAgentData)$/], MemberExpression[computed=true][property.value=/^(userAgent|userAgentData)$/], MemberExpression[computed=true][property.quasis.0.value.raw=/^(userAgent|userAgentData)$/], ObjectPattern > Property[key.name=/^(userAgent|userAgentData)$/], ObjectPattern > Property[key.value=/^(userAgent|userAgentData)$/], BinaryExpression[operator='in'][left.value=/^(userAgent|userAgentData)$/], CallExpression[callee.object.name='Reflect'][arguments.1.value=/^(userAgent|userAgentData)$/]",
          message: "No user-agent test. Detect the shell with the bridge handshake (src/lib/shellBridge.ts, PLAN ADR-4 and ADR-9).",
        },
        {
          selector: "MemberExpression[property.name='ReactNativeWebView'], MemberExpression[computed=true][property.value='ReactNativeWebView'], MemberExpression[computed=true][property.quasis.0.value.raw='ReactNativeWebView'], ObjectPattern > Property[key.name='ReactNativeWebView'], ObjectPattern > Property[key.value='ReactNativeWebView'], BinaryExpression[operator='in'][left.value='ReactNativeWebView'], CallExpression[callee.object.name='Reflect'][arguments.1.value='ReactNativeWebView'], Identifier[name='ReactNativeWebView']:not(TSPropertySignature > .key, Property > .key, MemberExpression > .property, TSTypeReference > .typeName)",
          message: "ReactNativeWebView belongs to packages/bridge. Ask the bridge (src/lib/shellBridge.ts) instead (PLAN ADR-9).",
        },
        {
          selector: "MemberExpression[property.name='messageHandlers'], MemberExpression[computed=true][property.value='messageHandlers'], MemberExpression[computed=true][property.quasis.0.value.raw='messageHandlers'], ObjectPattern > Property[key.name='messageHandlers'], ObjectPattern > Property[key.value='messageHandlers'], BinaryExpression[operator='in'][left.value='messageHandlers'], CallExpression[callee.object.name='Reflect'][arguments.1.value='messageHandlers']",
          message: "webkit.messageHandlers belongs to packages/bridge. Ask the bridge (src/lib/shellBridge.ts) instead (PLAN ADR-9).",
        },
      ],
    },
  },
);
