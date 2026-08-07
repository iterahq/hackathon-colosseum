/**
 * The EDITOR SEAM of the `code` kind.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE PACKAGE DOES NOT SHIP MONACO — not even behind `/code`
 * ─────────────────────────────────────────────────────────────────────────────
 * ADR-5 only asks that Monaco stay out of the BASE bundle. Step 5 went further
 * and kept it out of the package entirely, and the reason is not bundle size —
 * it is that the Player's editor is not a generic editor:
 *
 *  · `src/components/editor/CodeEditor.tsx` publishes every caret move on a
 *    `window` CustomEvent (`CODE_CARET_EVENT`) so the LIVE CLASS can mirror the
 *    learner's cursor onto the professor's stage. That is a live-session
 *    protocol, and `ActivityRendererProps` deliberately carries no live-session
 *    concerns (ADR-1).
 *  · it calls `configureTypeScriptDefaults`, which exists because these editors
 *    have no tsconfig and run against runtime-injected globals — tuned against
 *    THIS repo's self-hosted Monaco vendoring (`scripts/vendor-monaco.ts`,
 *    served from `/vendor/monaco/vs`).
 *
 * Shipping either would hand every consumer an Itera implementation detail. And
 * a lazily-imported optional peer would not have been a default at all: it can
 * only render in a host that separately installed `@monaco-editor/react`, so
 * "works out of the box" would have been false exactly where it matters — the
 * first render in a fresh consumer.
 *
 * So: the host injects its editor through `<ActivityProvider codeEditor={…}>` —
 * the SAME mechanism as `i18n`, `api`, `identity` and `storage`, not a second
 * one — and the fallback below is a real, dependency-free editing surface. A
 * learner on the fallback can read, write and submit; what they lose is syntax
 * highlighting, not the exercise.
 *
 * It also makes the ADR-5 guarantee STRUCTURAL rather than conditional:
 * `scripts/assert-entrypoint-isolation.mjs` walks the built module graph and no
 * reachable file in EITHER entrypoint names `@monaco-editor/react`, so there is
 * no arrangement of dynamic imports for a future edit to get wrong.
 */
import { useActivityHost } from '../context.js';
import type { ActivityCodeEditorProps } from '../ports.js';

/**
 * The zero-dependency editor: a monospaced `<textarea>`.
 *
 * `spellCheck`/`autoCapitalize`/`autoCorrect` are off because a phone keyboard
 * "helpfully" capitalising `const` is a real failure mode on the shared tablets
 * this content runs on, and `data-testid="code-editor"` is part of the contract
 * so a consumer's own e2e can find the surface without knowing which editor the
 * host injected.
 */
export function FallbackCodeEditor({
  value,
  onChange,
  language = 'typescript',
  readOnly = false,
}: ActivityCodeEditorProps) {
  return (
    <textarea
      data-testid="code-editor"
      data-code-language={language}
      className="h-full w-full resize-none border-0 bg-[#0a0a0a] p-4 font-mono text-sm leading-relaxed text-neutral-100 outline-none"
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      value={value}
      readOnly={readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}

/**
 * The editor the host asked for, or the fallback.
 *
 * A component and not a hook returning a component, so React sees a stable
 * element type across renders instead of remounting the editor (and losing the
 * caret) whenever the provider's value identity changes.
 */
export function CodeEditorSurface(props: ActivityCodeEditorProps) {
  const Editor = useActivityHost().codeEditor ?? FallbackCodeEditor;
  return <Editor {...props} />;
}
