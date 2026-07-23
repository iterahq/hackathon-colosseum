/**
 * TypeScript-worker setup for the player's Monaco editors.
 *
 * Monaco boots the TS worker with `typescriptDefaults` = `{ allowJs: undefined,
 * jsx: undefined }` + `{ noSemanticValidation: false }`. Left alone, that puts
 * RED SQUIGGLES UNDER CORRECT CODE in a learning player, for two independent
 * reasons:
 *
 *  1. **JSX is a SYNTAX error.** The worker picks the TS `ScriptKind` from the
 *     model URI's extension (`tsWorker#getScriptKind`). With no `path` the URI
 *     is `inmemory://model/N` (no extension) and the worker falls back to
 *     `ScriptKind.TS` -> `LanguageVariant.Standard`, so `<h1 className="x">` is
 *     parsed as a type assertion and errors out. Disabling *semantic*
 *     validation does NOT silence this — the model itself has to be TSX, which
 *     is what `modelPathFor` arranges.
 *  2. **Injected globals look undefined.** The snack preview runs the code with
 *     React and its hooks injected as globals (no `import` statement), so plain
 *     type-checking reports `Cannot find name 'useState'` — a red error under
 *     the exact API the lesson is teaching.
 *
 * There is also no tsconfig, no module graph and no `node_modules` behind these
 * editors, so EVERY import is unresolvable: semantic diagnostics here are
 * structurally noise, never signal. Syntax diagnostics stay ON — an unclosed
 * brace or a mismatched JSX tag is real feedback a learner should see.
 *
 * WARNING: `monaco.languages.typescript.*Defaults` is a PROCESS-WIDE SINGLETON,
 * not per-editor state. If two editors requesting different settings are
 * mounted at once, the last one to mount wins. The player shows one activity at
 * a time, so this is not a live concern — but do not read the per-editor prop
 * as isolation.
 */
import type { Monaco } from '@monaco-editor/react';

/** Monaco language id -> file extension that makes the TS worker parse JSX. */
const TS_FAMILY_EXTENSION: Record<string, string> = {
  typescript: 'tsx',
  javascript: 'jsx',
};

/**
 * Model path for one editor instance, or `undefined` for languages that are not
 * served by the TypeScript worker (those keep Monaco's default `inmemory://`
 * model, so nothing changes for them).
 *
 * `instanceId` MUST be unique per mounted editor: `@monaco-editor/react` reuses
 * an existing model when the path matches, so two editors sharing a path would
 * silently share their content.
 */
export function modelPathFor(language: string, instanceId: number): string | undefined {
  const extension = TS_FAMILY_EXTENSION[language];
  return extension ? `file:///itera-snack-${instanceId}.${extension}` : undefined;
}

/**
 * Apply the player's TypeScript worker configuration: JSX parsing on, semantic
 * diagnostics per `semanticValidation`, syntax diagnostics always on.
 *
 * Defensive against a partially-stubbed `monaco` — the editor is mocked in most
 * test suites.
 */
export function configureTypeScriptDefaults(monaco: Monaco, semanticValidation: boolean): void {
  const ts = monaco?.languages?.typescript;
  if (!ts) return;

  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    if (!defaults) continue;

    defaults.setCompilerOptions({
      ...defaults.getCompilerOptions(),
      // Teaching content is React. Without this a TSX model reports
      // "Cannot use JSX unless the '--jsx' flag is provided".
      jsx: ts.JsxEmit.React,
      allowNonTsExtensions: true,
    });

    defaults.setDiagnosticsOptions({
      noSemanticValidation: !semanticValidation,
      // Real syntax errors stay visible — that feedback IS useful to a learner.
      noSyntaxValidation: false,
      // Suggestions ("declared but never used") ride along with type-checking:
      // on a half-written exercise they are noise, not signal.
      noSuggestionDiagnostics: !semanticValidation,
    });
  }
}
