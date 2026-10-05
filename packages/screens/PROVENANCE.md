# Provenance — universal screens (R-11, R-18 shell half)

Shape derived from `devfellowship/dfl-lesson-studio` at commit `c90ad44cd6e55d37d337bb26ede17e96a10c51f1` (read 2026-10-05). Nothing is copied verbatim; each file below names its source in its header.

| Here | Lesson Studio | What was kept | What differs, and why |
|---|---|---|---|
| `packages/screens` (per-screen `exports`, source-only) | `packages/screens/package.json` | one entry per screen, no build, `.ts(x)` exports | no `peerDependencies`: this shell is not a root workspace (PLAN ADR-1), and a linked package with peers would get its own `node_modules/react` |
| `src/not-found/NotFoundScreen.tsx` | `src/coming-soon/ComingSoonScreen.tsx` | `View`/`Text` from `react-native`, `className`, `role="heading"` + `aria-level`, `role="paragraph"` on the web, each `Text` names its font/size/colour | `Platform.OS` lives in `slots/` (ADR-8 rule 2c); host needs are props typed by `@iterahq/shell-core` ports |
| `src/not-found/slots/webSemantics.ts` | `src/exports/text.ts` (`PARAGRAPH`), `src/exports/link.ts` (`linkProps`) | `href` on the web makes react-native-web render `<a>` | no `onPress` on the web: the old page's link was a plain anchor (full navigation), kept as is |
| `theme/{theme,tokens}.css` | `packages/screens/theme.native.css` | a theme file under `packages/screens` that the native Uniwind entry imports | NOT a copy of resolved values: the web imports the same two files |
| `packages/core` (`lib` without DOM, `types: []`) | `packages/core/tsconfig.json`, `src/ports/*` | ports as interfaces, platform-free by the compiler | three small ports; adapters live with each host |
| `scripts/vite/universal-screens.ts` | `vite.config.ts` (`uniwind()`, `webCssPipelineOfMain`), `scripts/vite/rnw-lazy-responder.ts` (the edit-the-installed-source pattern) | `uniwind()` without `vite-plugin-rnw`; the app's CSS pipeline restored | `@tailwindcss/postcss` instead of `@tailwindcss/vite`; `src/index.css` does not import `uniwind`; the edit removes react-native-web's document reset; the responder edit is not ported |
| `apps/mobile/{metro.config.js,uniwind-options.js,global.css,src/uniwind-env.d.ts}` | `apps/ios/` same names | `withUniwindConfig` outermost, `rem` polyfill 16, `@source` of the screens, the `uniwind/types` reference | the resolver hook that pins a shared package's imports to `apps/mobile` (Lesson Studio's shell is a root workspace and needs none) |
| `apps/mobile/app/preview/not-found.tsx` | `apps/ios/app/preview/[screen].tsx` | a `__DEV__`-only preview route that redirects home in a release build | one thin file per screen (ADR-8 rule 1) |
