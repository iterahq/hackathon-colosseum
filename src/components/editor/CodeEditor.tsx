import { useRef } from 'react';
import Editor from '@monaco-editor/react';
import { configureTypeScriptDefaults, modelPathFor } from './monacoTypescript';

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: string;
  readOnly?: boolean;
  highlightLines?: number[];
  fontSize?: number;
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
}: CodeEditorProps) {
  // Claimed lazily once per mounted editor; stable across re-renders.
  const instanceIdRef = useRef<number>();
  if (instanceIdRef.current === undefined) {
    instanceIdRef.current = ++modelSeq;
  }
  const path = modelPathFor(language, instanceIdRef.current);

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
