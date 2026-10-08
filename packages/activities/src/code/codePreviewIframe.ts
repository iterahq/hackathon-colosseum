import type { CodeCheck } from '@iterahq/activity-spec';
import { CODE_PREVIEW_HTML_CHECK_RUNTIME_SOURCE, CODE_PREVIEW_RUNTIME_SOURCE } from './codePreviewRuntime.js';

/**
 * The self-contained document for the code-snack preview iframe. Runs INSIDE a
 * `sandbox="allow-scripts"` opaque origin (student code cannot reach the parent
 * app/cookies/storage). Loads vendored React UMD + the Tailwind Play CDN (both
 * same-origin `public/vendor/` assets — no runtime external fetch), then renders
 * the learner's transpiled component on each `itera:code` message.
 *
 * Scope exposed to the learner's code = React + the hooks + a `require` shim.
 * The shim matters: sucrase's `imports` transform rewrites `import { useState }
 * from 'react'` into `require('react')`, and without it the most idiomatic line
 * a React beginner writes dies with "require is not defined". The bare globals
 * stay too, so already-authored starters that never import keep working.
 *
 * ── The message protocol (both directions) ────────────────────────────────
 *   parent → iframe  `{ type: 'itera:code',       code }`
 *       Render this source. Fired as the learner types.
 *   parent → iframe  `{ type: 'itera:run-checks', code, checks, token }`
 *       Render this source AND grade it. The code rides along ON PURPOSE so a
 *       submit can never race the last keystroke's render — what gets graded is
 *       exactly what the learner submitted.
 *   iframe → parent  `{ type: 'itera:ready' }`
 *   iframe → parent  `{ type: 'itera:checks', results: [{ id, passed }], token }`
 *       `token` is echoed back untouched: a slow run can land after the learner
 *       already submitted again, and the parent has to be able to drop it.
 *
 * ── The DOM the checks see ────────────────────────────────────────────────
 * `#preview` is the check root and holds exactly two children: `#root` (the
 * React mount) and `[data-itera-alert]` (the alert strip — see
 * `installPreviewDialogShims`). The error console lives OUTSIDE it so a
 * learner's selector can never match it.
 */
export const CODE_PREVIEW_IFRAME_HTML = [
  '<!doctype html><html><head><meta charset="utf-8" />',
  '<script src="/vendor/react.production.min.js"></script>',
  '<script src="/vendor/react-dom.production.min.js"></script>',
  '<script src="/vendor/tailwind-play-cdn.js"></script>',
  '<style>html,body{margin:0;padding:12px;background:#fff;font-family:ui-sans-serif,system-ui,sans-serif}',
  '#err{color:#dc2626;font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap}',
  '#itera-alert{margin-top:10px;padding:8px 10px;border-radius:8px;background:#111827;color:#f9fafb;',
  'font-size:13px;line-height:1.4;white-space:pre-wrap}',
  '#itera-alert[hidden]{display:none}</style>',
  '</head><body>',
  '<div id="preview"><div id="root"></div><div id="itera-alert" data-itera-alert hidden></div></div>',
  '<div id="err"></div>',
  '<script>',
  CODE_PREVIEW_RUNTIME_SOURCE,
  'var previewEl=document.getElementById("preview");',
  'var mountEl=document.getElementById("root");',
  'var alertEl=document.getElementById("itera-alert");',
  'var errEl=document.getElementById("err");',
  'var dialogs=__iteraInstallDialogs(window,alertEl);',
  'var iteraRequire=__iteraCreateRequire(window);',
  'var root=null;var Comp=null;',
  'function showErr(m){errEl.textContent=m;}',
  'function msgOf(e){return String(e&&e.message?e.message:e);}',
  // A component that throws DURING React render surfaces asynchronously (React
  // 18 rethrows to the global handler), so the try/catch below would miss it —
  // catch it here or the learner just sees a blank preview with no explanation.
  'window.addEventListener("error",function(e){showErr(msgOf(e.error||e.message));});',
  'function evalCode(code){',
  '  var exports={};var module={exports:exports};',
  '  var fn=new Function("React","useState","useEffect","useRef","useMemo","useCallback","require","exports","module",code);',
  '  fn(React,React.useState,React.useEffect,React.useRef,React.useMemo,React.useCallback,iteraRequire,exports,module);',
  '  var C=module.exports&&module.exports.default?module.exports.default:module.exports;',
  '  if(typeof C!=="function")throw new Error("Seu componente precisa de um export default.");',
  '  return C;',
  '}',
  // Fresh mount from the initial state — used both for a normal render and to
  // isolate every check that simulates an interaction. A scheduler callback can
  // be delayed beyond rAF + setTimeout, so mount must be a real commit barrier.
  'function mount(){',
  '  if(root){root.unmount();root=null;}',
  '  dialogs.reset();mountEl.innerHTML="";',
  '  root=ReactDOM.createRoot(mountEl);',
  '  ReactDOM.flushSync(function(){root.render(React.createElement(Comp));});',
  '}',
  'function render(code){errEl.textContent="";Comp=evalCode(code);mount();}',
  // Mount commits synchronously, including each interaction-check remount.
  // The tick still lets browser events and their effects settle between steps.
  'function nextTick(){return new Promise(function(res){',
  '  var raf=window.requestAnimationFrame||function(cb){return setTimeout(cb,16);};',
  '  raf(function(){setTimeout(res,0);});});}',
  'function allFailed(checks){return checks.map(function(c){return {id:c.id,passed:false};});}',
  'function reply(results,token){window.parent.postMessage({type:"itera:checks",results:results,token:token},"*");}',
  'window.addEventListener("message",function(e){',
  '  if(!e.data)return;',
  '  if(e.data.type==="itera:code"){',
  '    try{render(e.data.code);}catch(err){showErr(msgOf(err));}',
  '    return;',
  '  }',
  '  if(e.data.type==="itera:run-checks"){',
  '    var checks=e.data.checks||[];var token=e.data.token;',
  '    try{render(e.data.code);}catch(err){showErr(msgOf(err));reply(allFailed(checks),token);return;}',
  '    nextTick().then(function(){',
  '      return __iteraRunChecks({root:previewEl,checks:checks,remount:mount,nextTick:nextTick,win:window});',
  '    }).then(function(r){reply(r,token);},function(){reply(allFailed(checks),token);});',
  '    return;',
  '  }',
  '});',
  'window.parent.postMessage({type:"itera:ready"},"*");',
  '</script></body></html>',
].join('');

/**
 * The plain-web (`language: 'html'`, one-behaviour code kinds) preview document for ONE
 * render. `source` is the learner's FULL HTML document
 * (`<!DOCTYPE html>`, `<head>`, inline `<style>`/`<script>` and all) —
 * rendered exactly as authored, no transpile, no `#root`/`#preview` wrapper —
 * with a one-line bootstrap script APPENDED after it that only announces
 * `itera:ready`.
 *
 * ── WHY A FRESH DOCUMENT PER RENDER, NOT AN IN-PLACE RE-RENDER ─────────────
 * An earlier version of this reused ONE long-lived iframe and re-painted the
 * learner's markup into it on every keystroke (`DOMParser` + swapping
 * `head`/`body`). That kept `window`/`document` identity across renders, and
 * for arbitrary learner JS — the whole point of the Básico JS unit — that is
 * wrong in two learner-visible ways: a top-level `let`/`const`/`class` throws
 * "Identifier has already been declared" the SECOND time its script runs, and
 * a listener attached to `document`/`window` (as opposed to one on a specific
 * element, which dies when `innerHTML` throws that element away) ACCUMULATES
 * one more handler per render — a click step then fires the handler N times,
 * not once, and a counter check reads the wrong number.
 *
 * `CodeLivePreview` now sets THIS as the iframe's entire `srcDoc` on every
 * render (debounced — see `useHtmlLivePreview`). Reassigning `srcDoc` is a
 * real navigation: the browser discards the previous document and hands the
 * new one a BRAND NEW realm, so nothing survives between renders by
 * construction — no revival trick needed, no accumulation possible.
 *
 * ── WHY APPENDED, NOT SPLICED INTO `<body>` ─────────────────────────────────
 * The HTML5 parser is forgiving of content after `</html>`: it re-enters "in
 * body" insertion mode and appends it, so this lands the bootstrap as the
 * LAST node of `<body>` regardless of how well-formed the learner's document
 * is. Locating and rewriting `</body>` by hand would fail on exactly the
 * malformed HTML a beginner writes. TRADE-OFF, and it is a real one: a check
 * selector that reads `:last-child` off `body` (or a bare `body >
 * script:last-child`) would match OUR node instead of the learner's last
 * element. No shipped `checks[].selector` does that — authors target learner
 * markup by tag/id/class, never "whatever happens to be last on the page" —
 * and it is written down here for the one that tries.
 */
export function buildHtmlPreviewDocument(source: string): string {
  return source + `<script>window.parent.postMessage({type:"itera:ready",empty:${HTML_PREVIEW_IS_EMPTY}},"*");</script>`;
}

/**
 * Evaluated INSIDE the preview, once the document has been parsed: true when the page
 * draws nothing — no text outside `<script>`/`<style>` and no element that shows without text. A script that only
 * talks to the console leaves exactly that, and the parent cannot look for itself (the
 * frame is an opaque origin). `ready` carries it so a surface may choose not to show an
 * empty white box; a surface that ignores the field is unaffected.
 */
const HTML_PREVIEW_IS_EMPTY =
  '(function(){var b=document.body;if(!b)return true;' +
  'if(b.querySelector("img,svg,canvas,video,audio,input,button,select,textarea,iframe,hr"))return false;' +
  'var w=document.createTreeWalker(b,4),n;' +
  'while((n=w.nextNode())){var p=n.parentNode&&n.parentNode.nodeName;' +
  'if(p!=="SCRIPT"&&p!=="STYLE"&&p!=="NOSCRIPT"&&p!=="TEMPLATE"&&/\\S/.test(n.nodeValue))return false;}' +
  'return true;})()';

/**
 * The GRADED twin of `buildHtmlPreviewDocument`: same fresh-document-per-call
 * contract, but the appended script runs `checks` against the freshly-parsed
 * `document` (via `runCodeChecks`, `root: document` — the whole page, exactly
 * like the contract promises) and replies with the verdicts instead of just
 * announcing readiness.
 *
 * One call = one FRESH realm, so `remount` — only ever invoked by a check that
 * carries `steps`, to isolate it from a PREVIOUS check's mutations — is a
 * no-op here: there is nothing to reset, nothing has touched this document
 * yet. Isolation between TWO stepped checks in the same submission instead
 * comes from `useHtmlLivePreview.gradeHtml` calling this function ONCE PER
 * STEPPED CHECK (a separate fresh realm each), while every check WITHOUT
 * `steps` is safe to batch into a single call — the same rule
 * `runCodeChecks` itself already applies when it decides whether to remount.
 */
export function buildHtmlCheckDocument(source: string, checks: CodeCheck[]): string {
  return [
    source,
    '<script>',
    CODE_PREVIEW_HTML_CHECK_RUNTIME_SOURCE,
    'var __checks=' + serializeForInlineScript(checks) + ';',
    // The raw source rides along for the source-level asserts (`closes`,
    // `source_has`): the document below is what the PARSER made of it, which is
    // exactly what hides an `<h2>…</h3>`.
    'var __source=' + serializeForInlineScript(source) + ';',
    'function nextTick(){return new Promise(function(res){',
    '  var raf=window.requestAnimationFrame||function(cb){return setTimeout(cb,16);};',
    '  raf(function(){setTimeout(res,0);});});}',
    'function noopRemount(){}',
    '__iteraRunChecks({root:document,checks:__checks,remount:noopRemount,nextTick:nextTick,win:window,source:__source})',
    '  .then(function(r){window.parent.postMessage({type:"itera:checks",results:r},"*");},',
    '        function(){window.parent.postMessage({type:"itera:checks",results:__checks.map(function(c){return {id:c.id,passed:false};})},"*");});',
    '</script>',
  ].join('');
}

/**
 * JSON that is safe to inline inside a `<script>` element. A check's
 * `selector`/`text`/`label` is author-controlled and may legitimately contain
 * `</script>` (a selector such as `script[src$="</script>"]`, expected text
 * quoting markup) or `<!--`; raw, either ends or re-modes the script element
 * and the rest of the grading document becomes markup. Escaping EVERY `<` as
 * `\u003c` covers `</script`, `<!--` and `<script` at once and parses back to
 * the identical string; U+2028/U+2029 are escaped too so the literal stays
 * valid on engines that predate JSON-superset syntax.
 */
function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
