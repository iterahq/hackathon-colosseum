/**
 * The Vite half of a universal screen (`packages/screens`), shared by `vite.config.ts` and
 * `vitest.config.ts` so that a unit test renders a screen the way the build bundles it.
 *
 * Derived from devfellowship/dfl-lesson-studio `vite.config.ts` (the "lean" setup: `uniwind()` and
 * no `vite-plugin-rnw`, whose `global -> window` define breaks workers).
 *
 * `uniwind()` does two things this app wants and one it must not get:
 *   - it aliases `react-native` to Uniwind's web components over react-native-web, so `className`
 *     on a `View`/`Text` reaches the DOM element;
 *   - it puts react-native-web's runtime stylesheet inside `@layer rnw`, so every Tailwind utility
 *     (unlayered here, `src/index.css`) beats the reset classes of a `View`/`Text`;
 *   - it switches ALL the app's CSS to lightningcss with its own visitor. `cssPipelineOfMain` undoes
 *     that: the stylesheet of this app is built by `@tailwindcss/postcss` and must not change by a byte.
 *
 * `rnwLeavesNothingBehind` removes what react-native-web would leave in the document after a screen.
 *
 * `uniwind()` also writes a generated `.d.ts` on every start; it is sent to `node_modules`, because
 * the web typecheck does not use it (`packages/screens/types/react-native.web.d.ts`).
 *
 * `src/index.css` does NOT import `uniwind`: that import redefines `dark:` and `disabled:` for every
 * page. A universal screen therefore has no `web:`/`native:`/`ios:` variant on the web.
 */
import type { Plugin } from "vite";
import { uniwind } from "uniwind/vite";

/**
 * Uniwind reads its CSS entry with lightningcss to list theme variables. `src/index.css` is not
 * readable that way (`@import … source(none)`), so the entry is the token file both platforms share.
 */
const THEME_ENTRY = "./packages/screens/theme/theme.css";

function cssPipelineOfMain(): Plugin {
  return {
    name: "itera:css-pipeline-of-main",
    config: () => ({ css: { transformer: "postcss" as const } }),
    // A config merge cannot remove a key, and the build's CSS minifier reads `css.lightningcss` too.
    configResolved(config) {
      const lightningcss = config.css.lightningcss as { visitor?: unknown } | undefined;
      if (lightningcss) delete lightningcss.visitor;
    },
  };
}

/**
 * Two edits of the installed react-native-web, made while it is bundled. Each is something the library
 * leaves in the DOCUMENT after the screen is gone, so without them a visit to one universal screen would
 * follow the learner to every page opened afterwards. An edit must match its file exactly once, or the
 * build fails: an upgrade that moves these lines needs a new look, not a silent no-op.
 * The pattern (and the second edit) is derived from Lesson Studio's `scripts/vite/rnw-lazy-responder.ts`.
 *
 * 1. The runtime stylesheet starts with four document-wide rules (`html`, `body`, `::-moz-focus-inner`,
 *    `input::-webkit-search-*{display:none}`). The last one would hide the clear button of the header
 *    search. This app has its own Preflight; with the rules gone the sheet holds class rules only
 *    (`.css-*`, `.r-*`), which match nothing outside a screen.
 * 2. The responder system puts thirteen listeners on `document` and one on `window` when the FIRST `View`
 *    mounts, and never removes them. They are attached when a node registers with the responder system
 *    instead (a `Pressable`, a `ScrollView`).
 * 3. They are detached when the last registered node leaves (the login screen has three `Pressable`s). A
 *    touch or mouse button still down defers the detach to the event that releases it.
 */
const RNW_EDITS: { file: RegExp; edits: [from: string | RegExp, to: string][] }[] = [
  {
    file: /react-native-web[\\/]dist[\\/]exports[\\/]StyleSheet[\\/]dom[\\/]index\.js$/,
    edits: [[/var initialRules = \[[\s\S]*?\];/g, "var initialRules = [];"]],
  },
  {
    file: /react-native-web[\\/]dist[\\/]modules[\\/]useResponderEvents[\\/]index\.js$/,
    edits: [
      ["  React.useEffect(() => {\n    ResponderSystem.attachListeners();\n    return () => {", "  React.useEffect(() => {\n    return () => {"],
      [
        "    if (requiresResponderSystem) {\n      ResponderSystem.addNode(id, node, config);",
        "    if (requiresResponderSystem) {\n      ResponderSystem.attachListeners();\n      ResponderSystem.addNode(id, node, config);",
      ],
    ],
  },
  {
    file: /react-native-web[\\/]dist[\\/]modules[\\/]useResponderEvents[\\/]ResponderSystem\.js$/,
    edits: [
      [
        "  if (responderListenersMap.has(id)) {\n    responderListenersMap.delete(id);\n  }\n}",
        "  if (responderListenersMap.has(id)) {\n    responderListenersMap.delete(id);\n  }\n  detachWhenIdle();\n}\n" +
          "function detachWhenIdle() {\n" +
          "  if (responderListenersMap.size !== 0 || !canUseDOM || window.__reactResponderSystemActive == null) {\n    return;\n  }\n" +
          "  if (trackedTouchCount !== 0 || currentResponder.id != null) {\n    return;\n  }\n" +
          "  window.removeEventListener('blur', eventListener);\n" +
          "  documentEventsBubblePhase.forEach(eventType => {\n    document.removeEventListener(eventType, eventListener);\n  });\n" +
          "  documentEventsCapturePhase.forEach(eventType => {\n    document.removeEventListener(eventType, eventListener, true);\n  });\n" +
          "  window.__reactResponderSystemActive = null;\n" +
          "  isEmulatingMouseEvents = false;\n" +
          "}",
      ],
      ["function eventListener(domEvent) {\n", "function eventListener(domEvent) {\n  eventListenerOfRnw(domEvent);\n  detachWhenIdle();\n}\nfunction eventListenerOfRnw(domEvent) {\n"],
    ],
  },
];

const occurrences = (code: string, from: string | RegExp) => (typeof from === "string" ? code.split(from).length - 1 : (code.match(from) ?? []).length);

/** The edited source of a react-native-web file, or `null` for a file with no edit. */
export function editRnw(code: string, id: string): string | null {
  const file = id.split("?")[0];
  const entry = RNW_EDITS.find((e) => e.file.test(file));
  if (!entry) return null;
  return entry.edits.reduce((out, [from, to], i) => {
    const found = occurrences(out, from);
    if (found !== 1) throw new Error(`react-native-web edit ${i + 1} of ${file}: expected one match, found ${found}`);
    return out.replace(from, to);
  }, code);
}

const editRnwModule = (code: string, id: string) => {
  const edited = editRnw(code, id);
  return edited === null ? null : { code: edited, map: null };
};

function rnwLeavesNothingBehind(): Plugin {
  return {
    name: "itera:rnw-leaves-nothing-behind",
    // The dev server pre-bundles react-native-web, where a Vite `transform` does not reach.
    config: () => ({ optimizeDeps: { rolldownOptions: { plugins: [{ name: "itera:rnw-leaves-nothing-behind", transform: editRnwModule }] } } }),
    transform: editRnwModule,
  };
}

export function universalScreens(): Plugin[] {
  return [
    uniwind({ cssEntryFile: THEME_ENTRY, dtsFile: "./node_modules/.uniwind-types.d.ts" }) as Plugin,
    cssPipelineOfMain(),
    rnwLeavesNothingBehind(),
  ];
}
