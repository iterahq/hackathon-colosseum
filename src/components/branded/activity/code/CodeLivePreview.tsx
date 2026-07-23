import { useEffect, useMemo, useRef, useState } from 'react';
import { CODE_PREVIEW_IFRAME_HTML } from '@/consts/codePreviewIframe';
import { transpileSnack } from '@/utils/transpileSnack';

/**
 * Live React preview of the learner's snack, MOUNTED INSIDE a hardened
 * `<iframe sandbox="allow-scripts">` (opaque origin — student code CANNOT reach
 * the parent app, its cookies, or storage).
 *
 * A strict `allow-scripts` iframe is a cross-origin opaque document, so the
 * parent cannot portal React into its `contentDocument` (verified: access is
 * null). The iframe is therefore a SELF-CONTAINED runtime (see
 * `CODE_PREVIEW_IFRAME_HTML`): vendored React UMD + the Tailwind Play CDN render
 * the code INSIDE the sandbox. Transpilation is sucrase (a direct dependency),
 * which turns the single-file JSX into plain JS in the PARENT; the transpiled
 * source crosses the isolation boundary only via `postMessage`.
 */
export function CodeLivePreview({ code }: { code: string }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const compiled = useMemo(() => transpileSnack(code), [code]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source === iframeRef.current?.contentWindow && e.data?.type === 'itera:ready') {
        setReady(true);
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
