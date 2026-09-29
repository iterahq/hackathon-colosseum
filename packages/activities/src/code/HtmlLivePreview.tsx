import { useRef } from 'react';
import { useHtmlLivePreview } from './useHtmlLivePreview.js';
import type { CodeCheckResult, CodeChecksRequest } from './types.js';

/**
 * The `language: 'html'` preview: the learner's FULL document, rendered
 * exactly as authored, inside the same hardened `sandbox="allow-scripts"`
 * iframe the React path uses (no `allow-same-origin`, unchanged).
 *
 * The one thing this preview does differently from the React path is WHEN it
 * navigates the iframe: every render — editing (debounced) and grading
 * (never debounced) alike — sets a BRAND NEW `srcDoc`, which is a real
 * navigation and therefore a real fresh realm. `useHtmlLivePreview` owns that
 * whole story; see its docblock and `buildHtmlPreviewDocument`'s for why an
 * in-place re-render (the earlier design) let a top-level `let`/`const`
 * redeclare-crash and let `document`/`window` listeners accumulate across
 * renders.
 *
 * No `#err` overlay: parsing HTML never fails the way sucrase can, so there
 * is no local "syntax error" state to surface for this language.
 */
export function HtmlLivePreview({
  code,
  checksRequest = null,
  onChecksResult,
}: {
  code: string;
  checksRequest?: CodeChecksRequest | null;
  onChecksResult?: (results: CodeCheckResult[], token: number) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { srcDoc, frameKey } = useHtmlLivePreview(iframeRef, code, checksRequest, onChecksResult);

  return (
    <div className="relative h-full w-full">
      <iframe
        key={frameKey}
        ref={iframeRef}
        title="code-preview"
        sandbox="allow-scripts"
        srcDoc={srcDoc}
        className="h-full w-full border-0 bg-white"
        data-testid="code-preview-iframe"
      />
    </div>
  );
}
