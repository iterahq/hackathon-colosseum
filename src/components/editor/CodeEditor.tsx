import { useEffect, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { EditableRegion } from '@iterahq/activities';
import { isEditAllowed } from '@iterahq/activities/code';
import { CODE_CARET_EVENT, type CodeCaretEventDetail } from '@/utils/stageCursorDom';
import { lockedLineRuns } from './lockedLineRuns';
import { configureTypeScriptDefaults, modelPathFor } from './monacoTypescript';

type MonacoEditorInstance = Parameters<OnMount>[0];
type MonacoNamespace = Parameters<OnMount>[1];
type DecorationsCollection = ReturnType<MonacoEditorInstance['createDecorationsCollection']>;
type Decoration = Parameters<DecorationsCollection['set']>[0][number];

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  highlightLines?: number[];
  fontSize?: number;
  /**
   * Caret of the person on stage, mirrored into this (read-only) editor.
   *
   * A pointer alone cannot answer "which line are you on" — over code, the
   * caret IS the cursor, and it is what makes "move one to the right" a
   * shared reference. Applying it also keeps the mirror scrolled to where the
   * work is happening; without it the class watches line 1 while the learner
   * types at line 80.
   */
  remoteCaret?: { line: number; column: number } | null;
  /**
   * Re-enable TypeScript SEMANTIC diagnostics (type-checking) for this editor.
   *
   * OFF by default: these editors have no tsconfig, no module graph and run
   * code against runtime-injected globals, so type-checking only produces false
   * errors under correct lesson code (see `./monacoTypescript`). Syntax
   * validation is ALWAYS on, so real mistakes still surface. A future
   * "fix the type error" exercise can opt back in.
   */
  semanticValidation?: boolean;
  /**
   * The ONLY ranges the learner may change (`@iterahq/activities/code`'s
   * `parseEditableRegions`). Empty/absent ⇒ the whole file is editable.
   *
   * Enforced by reverting: an edit that lands outside every region is undone
   * the instant it is applied, instead of being blocked at the keystroke.
   * Blocking at the key level would have to reimplement what counts as an edit
   * (paste, drag-drop, multi-cursor, autocomplete, the TypeScript quick-fix)
   * and would silently miss whichever path it forgot; the model change event is
   * the ONE funnel every one of those goes through, so "reject what arrives" is
   * complete by construction.
   */
  editableRegions?: readonly EditableRegion[];
}

/**
 * Monotonic per-page counter backing each editor's unique Monaco model URI.
 *
 * `useId()` is not enough: it only guarantees uniqueness inside ONE React root,
 * and a Storybook docs page mounts many roots. Two editors resolving to the
 * same model URI would silently SHARE their content, so uniqueness has to be
 * absolute.
 */
let modelSeq = 0;

export function CodeEditor({
  value,
  onChange,
  language = 'typescript',
  readOnly = false,
  highlightLines = [],
  fontSize = 14,
  semanticValidation = false,
  remoteCaret = null,
  editableRegions,
}: CodeEditorProps) {
  // Claimed lazily once per mounted editor; stable across re-renders.
  const instanceIdRef = useRef<number>();
  if (instanceIdRef.current === undefined) {
    instanceIdRef.current = ++modelSeq;
  }
  const path = modelPathFor(language, instanceIdRef.current);
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const monacoRef = useRef<MonacoNamespace | null>(null);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  // Read inside the model-change listener, which fires SYNCHRONOUSLY with the
  // edit — so this still holds the regions as they were BEFORE it, which is the
  // coordinate system `change.range` speaks.
  const regionsRef = useRef<readonly EditableRegion[] | undefined>(editableRegions);
  regionsRef.current = editableRegions;
  const regionDecorationsRef = useRef<DecorationsCollection | null>(null);
  // Monaco mounts ASYNCHRONOUSLY, after the effect below has already run and
  // found no editor. Nothing else re-renders this component, so without a state
  // flip the paint waited for the learner's FIRST keystroke — the file opened
  // with no band at all, which is the exact moment they need to see it.
  const [editorReady, setEditorReady] = useState(false);

  // Paint the region so "you may type here" is visible, not folklore. Kept in
  // an effect rather than in `onMount` because the regions move with every
  // newline the learner types.
  //
  // Painting the band alone was not enough with a real class: a highlight reads
  // as decoration until something else reads as OFF. So the locked code is faded
  // in the same pass, and the two together say where the keyboard works.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    const regions = editableRegions ?? [];
    const decorations: Decoration[] = regions.map((r) => ({
      range: new monaco.Range(r.startLineNumber, 1, r.endLineNumber, r.endColumn),
      options: {
        isWholeLine: true,
        className: 'editable-region-line',
        linesDecorationsClassName: 'editable-region-gutter',
        lineNumberClassName: 'editable-region-number',
      },
    }));
    for (const run of lockedLineRuns(regions, model.getLineCount())) {
      decorations.push({
        range: new monaco.Range(
          run.startLineNumber,
          1,
          run.endLineNumber,
          model.getLineMaxColumn(run.endLineNumber)
        ),
        options: { inlineClassName: 'locked-region-text' },
      });
    }
    if (regionDecorationsRef.current) regionDecorationsRef.current.set(decorations);
    else regionDecorationsRef.current = editor.createDecorationsCollection(decorations);
  }, [editableRegions, editorReady]);

  // Apply the remote caret. `revealLineInCenter` only fires when the caret has
  // left the visible range: following every keystroke would fight the viewer,
  // while never following would leave the mirror parked at the top of the file.
  const caretLine = remoteCaret?.line ?? null;
  const caretColumn = remoteCaret?.column ?? null;
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || caretLine === null || caretColumn === null) return;
    editor.setPosition({ lineNumber: caretLine, column: caretColumn });
    const ranges = editor.getVisibleRanges?.() ?? [];
    const onScreen = ranges.some(
      (r) => caretLine >= r.startLineNumber && caretLine <= r.endLineNumber
    );
    if (!onScreen) editor.revealLineInCenter(caretLine);
  }, [caretLine, caretColumn]);

  const handleEditorChange = (newValue: string | undefined) => {
    if (onChange && newValue !== undefined) {
      onChange(newValue);
    }
  };

  return (
    <div className="editor-container h-full" style={{ minHeight: '300px' }}>
      <Editor
        height="100%"
        language={language}
        path={path}
        value={value}
        onChange={handleEditorChange}
        theme="vs-dark"
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize,
          lineHeight: fontSize * 1.6,
          fontFamily: "'JetBrains Mono', monospace",
          fontLigatures: true,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: 'all',
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
          automaticLayout: true,
          tabSize: 2,
          bracketPairColorization: { enabled: true },
          scrollbar: {
            vertical: 'auto',
            horizontal: 'hidden',
            useShadows: false,
            verticalScrollbarSize: 8,
          },
        }}
        beforeMount={(monaco) => {
          configureTypeScriptDefaults(monaco, semanticValidation);

          monaco.editor.defineTheme('iterate-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'comment', foreground: '6A9955' },
              { token: 'keyword', foreground: 'F39325' },
              { token: 'string', foreground: 'CE9178' },
              { token: 'number', foreground: 'B5CEA8' },
              { token: 'type', foreground: '4EC9B0' },
            ],
            colors: {
              'editor.background': '#0a0a0a',
              'editor.foreground': '#fafafa',
              'editor.lineHighlightBackground': '#1a1a1a',
              'editorLineNumber.foreground': '#6b7280',
              'editorLineNumber.activeForeground': '#f39325',
              'editor.selectionBackground': '#f3932544',
              'editor.inactiveSelectionBackground': '#f3932520',
              'editorCursor.foreground': '#f39325',
            },
          });
        }}
        onMount={(editor, monaco) => {
          monaco.editor.setTheme('iterate-dark');
          editorRef.current = editor;
          monacoRef.current = monaco;
          setEditorReady(true);

          // The wall. Undo (rather than prevent) for the reason in the prop's
          // doc; `isUndoing` guards the recursion, since the revert is itself a
          // model change whose ranges are, by definition, outside the region.
          editor.onDidChangeModelContent((e) => {
            const regions = regionsRef.current;
            if (!regions || regions.length === 0) return;
            if (e.isUndoing || e.isRedoing) return;
            if (e.changes.every((c) => isEditAllowed(regions, c.range))) return;
            editor.trigger('editableRegions', 'undo', null);
          });

          // Publish the local caret on a window event rather than a callback
          // prop: the only consumer is the live-class layer, and the editor sits
          // inside the activity tree, whose public contract deliberately does
          // not carry live-session concerns (see utils/stageCursorDom). Guarded
          // on `readOnly` so the read-only MIRROR never re-emits what it was
          // just told — that would be a feedback loop between two classrooms.
          editor.onDidChangeCursorPosition((e) => {
            if (readOnlyRef.current) return;
            const detail: CodeCaretEventDetail = {
              line: e.position.lineNumber,
              column: e.position.column,
            };
            window.dispatchEvent(new CustomEvent(CODE_CARET_EVENT, { detail }));
          });

          if (highlightLines.length > 0) {
            editor.createDecorationsCollection(
              highlightLines.map(line => ({
                range: new monaco.Range(line, 1, line, 1),
                options: {
                  isWholeLine: true,
                  className: 'highlighted-line',
                  glyphMarginClassName: 'highlighted-glyph',
                  linesDecorationsClassName: 'highlighted-line-decoration',
                },
              }))
            );
          }
        }}
      />
    </div>
  );
}
