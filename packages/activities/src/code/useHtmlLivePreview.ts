import { useEffect, useRef, useState, type RefObject } from 'react';
import type { CodeCheck } from '@iterahq/activity-spec';
import { buildHtmlCheckDocument, buildHtmlPreviewDocument } from './codePreviewIframe.js';
import type { CodeCheckResult, CodeChecksRequest } from './types.js';

/**
 * Debounce for the EDITING preview only. Every plain render is a REAL iframe
 * navigation (see `buildHtmlPreviewDocument`), which is far more expensive
 * than the React path's cheap in-place re-render — firing one per keystroke
 * would flicker the preview and reset any interaction the learner had going
 * inside it. A graded run (`checksRequest`) is NEVER debounced: it must grade
 * exactly what was submitted, the instant it was submitted.
 */
const HTML_RENDER_DEBOUNCE_MS = 250;

/**
 * How long ONE grading document may stay silent. The appended grading script
 * answers within a frame or two, so silence means the learner's own markup
 * swallowed it (an unclosed `<!--`, `<textarea>`, `<title>` or `<script>`
 * turns the rest of the document into text/comment/script data) or the
 * document crashed. Kept BELOW `useCodeChecks`' 8s safety net on purpose: a
 * grading that times out reports NOTHING here, and that safety net then owns
 * the verdict — "nothing passed", flagged `timedOut` so no life is charged for
 * a preview that never answered.
 */
const HTML_CHECK_DOCUMENT_TIMEOUT_MS = 5000;

/**
 * One submission's grading run. `cancel` is what the hook calls when the run
 * is superseded (a newer submit, a reset, an unmount): it settles the load in
 * flight and makes every later step of `gradeHtml` bail out.
 */
type GradingRun = { cancelled: boolean; cancelPending?: () => void };

/** The learner's preview: the document on screen plus a key that remounts the iframe. */
type PreviewView = { doc: string; frameKey: number };

/**
 * The `language: 'html'` half of the live preview: owns the iframe's `srcDoc`
 * and the grading sequence, both built around the SAME rule — every render
 * gets a FRESH realm (see `buildHtmlPreviewDocument`'s docblock for why an
 * in-place re-render was wrong for arbitrary learner JS).
 */
export function useHtmlLivePreview(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  code: string,
  checksRequest: CodeChecksRequest | null | undefined,
  onChecksResult?: (results: CodeCheckResult[], token: number) => void,
): { srcDoc: string; frameKey: number } {
  const [view, setView] = useState<PreviewView>(() => ({ doc: buildHtmlPreviewDocument(code), frameKey: 0 }));
  // A submit owns the iframe until it settles — the debounced editing effect
  // below must not overwrite a fresh document mid-grading with a stale one.
  const gradingRef = useRef(false);
  const codeRef = useRef(code);
  codeRef.current = code;

  useEffect(() => {
    if (gradingRef.current) return;
    const id = setTimeout(() => {
      const doc = buildHtmlPreviewDocument(code);
      setView((v) => (v.doc === doc ? v : { doc, frameKey: v.frameKey }));
    }, HTML_RENDER_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [code]);

  const onChecksResultRef = useRef(onChecksResult);
  onChecksResultRef.current = onChecksResult;

  const lastRunToken = useRef(0);
  // Bumped once per submission: a run that finishes after a newer one started
  // must not hand the iframe back or release `gradingRef` under the newer run.
  const generationRef = useRef(0);
  useEffect(() => {
    if (!checksRequest || checksRequest.token === lastRunToken.current) return;
    lastRunToken.current = checksRequest.token;
    gradingRef.current = true;
    const generation = ++generationRef.current;
    const run: GradingRun = { cancelled: false };
    const { token, code: submittedCode, checks } = checksRequest;

    gradeHtml(iframeRef, submittedCode, checks, run)
      .then((results) => {
        // `null` = superseded or the document never answered; nothing to report.
        if (results && generation === generationRef.current) onChecksResultRef.current?.(results, token);
      })
      .finally(() => {
        if (generation !== generationRef.current) return;
        gradingRef.current = false;
        // Hand the iframe back to the learner's own page — the grading
        // documents above are throwaway instrumented realms, never meant to
        // stay on screen. The `srcdoc` was set imperatively, so React would
        // see the same string in state and skip the update: bumping the key
        // remounts the iframe with the learner's source (the latest one, in
        // case it moved while grading).
        setView((v) => ({ doc: buildHtmlPreviewDocument(codeRef.current), frameKey: v.frameKey + 1 }));
      });

    return () => {
      run.cancelled = true;
      run.cancelPending?.();
    };
  }, [checksRequest, iframeRef]);

  return { srcDoc: view.doc, frameKey: view.frameKey };
}

/**
 * One fresh iframe navigation, resolved with whatever `itera:checks` answers —
 * or `null` when the run is cancelled or the document stays silent for
 * `HTML_CHECK_DOCUMENT_TIMEOUT_MS`. The listener and the timer are ALWAYS
 * released on the way out, so a swallowed grading script cannot leak a
 * listener that a later submission's reply would then be delivered to.
 * Sets `srcdoc` IMPERATIVELY (bypassing React's own `srcDoc` prop) because
 * grading is a SEQUENCE of throwaway navigations on the same element, driven
 * entirely by this promise chain — not by a render.
 */
function loadAndWaitForChecks(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  doc: string,
  run: GradingRun,
): Promise<CodeCheckResult[] | null> {
  return new Promise((resolve) => {
    const frame = iframeRef.current;
    if (!frame || run.cancelled) {
      resolve(null);
      return;
    }
    const finish = (results: CodeCheckResult[] | null) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      run.cancelPending = undefined;
      resolve(results);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.contentWindow) return;
      if (e.data?.type !== 'itera:checks') return;
      finish(Array.isArray(e.data.results) ? (e.data.results as CodeCheckResult[]) : []);
    };
    const timer = setTimeout(() => finish(null), HTML_CHECK_DOCUMENT_TIMEOUT_MS);
    run.cancelPending = () => finish(null);
    window.addEventListener('message', onMessage);
    frame.srcdoc = doc;
  });
}

/**
 * Grades `checks` against `code`, isolating every STEPPED check in its OWN
 * fresh navigation while every check WITHOUT `steps` shares ONE navigation —
 * the same rule `runCodeChecks` itself uses to decide whether a check needs
 * remounting, just applied at the REALM level instead of inside one
 * already-loaded document. That is what makes two stepped checks in the same
 * submission independent: before this fix they shared a realm (and its
 * accumulated `document`/`window` listeners) the same way two keystrokes did.
 *
 * Results come back matched to `checks`' original order regardless of which
 * batch answered them, exactly like the React path's `runCodeChecks` promises
 * "one result per check, in spec order".
 */
async function gradeHtml(
  iframeRef: RefObject<HTMLIFrameElement | null>,
  code: string,
  checks: CodeCheck[],
  run: GradingRun,
): Promise<CodeCheckResult[] | null> {
  const stepless = checks.filter((c) => !c.steps || c.steps.length === 0);
  const stepped = checks.filter((c) => c.steps && c.steps.length > 0);
  const collected: CodeCheckResult[] = [];

  // ANY batch that goes unanswered voids the whole submission (`null`) — a
  // partial verdict would grade the unanswered checks as failures the learner
  // may not have earned.
  const batches = [
    ...(stepless.length > 0 ? [stepless] : []),
    ...stepped.map((check) => [check]),
  ];
  for (const batch of batches) {
    const answered = await loadAndWaitForChecks(iframeRef, buildHtmlCheckDocument(code, batch), run);
    if (!answered || run.cancelled) return null;
    collected.push(...answered);
  }

  const byId = new Map(collected.map((r) => [r.id, r]));
  return checks.map((c) => byId.get(c.id) ?? { id: c.id, passed: false });
}
