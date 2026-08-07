import { useEffect, useMemo, useRef, useState } from 'react';
import { CODE_PREVIEW_IFRAME_HTML } from './codePreviewIframe.js';
import { transpileSnack } from './transpileSnack.js';
import type { CodeCheckResult, CodeChecksRequest } from './types.js';

/**
 * Live React preview of the learner's snack, MOUNTED INSIDE a hardened
 * `<iframe sandbox="allow-scripts">` (opaque origin — student code CANNOT reach
 * the parent app, its cookies, or storage).
 *
 * A strict `allow-scripts` iframe is a cross-origin opaque document, so the
 * parent cannot portal React into its `contentDocument` (verified: access is
 * null). The iframe is therefore a SELF-CONTAINED runtime (see
 * `CODE_PREVIEW_IFRAME_HTML`): vendored React UMD + the Tailwind Play CDN render
 * the code INSIDE the sandbox. The runtime transpiler (sucrase) turns the
 * single-file JSX into plain JS in the PARENT; the transpiled source crosses the
 * isolation boundary only via `postMessage`.
 *
 * The deterministic correction runs in the SAME place, for the same reason: the
 * checks assert against the rendered DOM, and only the iframe can see it. The
 * parent sends `checksRequest`, the iframe answers one verdict per check.
 */
export function CodeLivePreview({
  code,
  checksRequest = null,
  onChecksResult,
}: {
  code: string;
  /** A submit asking for a graded run; `token` re-triggers even identical code. */
  checksRequest?: CodeChecksRequest | null;
  /** `token` identifies WHICH submit this answers — a slow run can land late. */
  onChecksResult?: (results: CodeCheckResult[], token: number) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const compiled = useMemo(() => transpileSnack(code), [code]);

  // Keep the latest callback in a ref so the message listener can stay mounted
  // for the whole lifetime — re-subscribing on every render risks dropping an
  // in-flight reply from the iframe.
  const onChecksResultRef = useRef(onChecksResult);
  onChecksResultRef.current = onChecksResult;

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === 'itera:ready') setReady(true);
      if (e.data?.type === 'itera:checks' && Array.isArray(e.data.results)) {
        onChecksResultRef.current?.(e.data.results as CodeCheckResult[], Number(e.data.token));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (compiled.error) {
      setLocalError(compiled.error);
      return;
    }
    setLocalError(null);
    if (ready && compiled.code) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'itera:code', code: compiled.code },
        '*',
      );
    }
  }, [ready, compiled]);

  // A graded run. Source that does not even transpile is answered HERE instead
  // of in the iframe — there is nothing to render, so every check fails and the
  // learner already has the syntax error on screen.
  const lastRunToken = useRef(0);
  useEffect(() => {
    if (!checksRequest || checksRequest.token === lastRunToken.current) return;
    const compiledRun = transpileSnack(checksRequest.code);
    if (compiledRun.error) {
      lastRunToken.current = checksRequest.token;
      onChecksResultRef.current?.(
        checksRequest.checks.map((c) => ({ id: c.id, passed: false })),
        checksRequest.token,
      );
      return;
    }
    if (!ready) return;
    lastRunToken.current = checksRequest.token;
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'itera:run-checks',
        code: compiledRun.code,
        checks: checksRequest.checks,
        token: checksRequest.token,
      },
      '*',
    );
  }, [ready, checksRequest]);

  return (
    <div className="relative h-full w-full">
      <iframe
        ref={iframeRef}
        title="code-preview"
        sandbox="allow-scripts"
        srcDoc={CODE_PREVIEW_IFRAME_HTML}
        className="h-full w-full border-0 bg-white"
        data-testid="code-preview-iframe"
      />
      {localError && (
        <div
          data-testid="code-preview-error"
          className="absolute inset-x-0 bottom-0 max-h-1/2 overflow-auto bg-red-50 p-3 font-mono text-xs text-red-600 whitespace-pre-wrap"
        >
          {localError}
        </div>
      )}
    </div>
  );
}
