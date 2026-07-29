import { CODE_PREVIEW_RUNTIME_SOURCE } from '@/utils/codePreviewRuntime';

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
  // isolate every check that simulates an interaction.
  'function mount(){',
  '  if(root){root.unmount();root=null;}',
  '  dialogs.reset();mountEl.innerHTML="";',
  '  root=ReactDOM.createRoot(mountEl);',
  '  root.render(React.createElement(Comp));',
  '}',
  'function render(code){errEl.textContent="";Comp=evalCode(code);mount();}',
  // React 18 commits asynchronously: rAF + a macrotask is the cheapest way to be
  // sure we read the NEW DOM rather than the previous one.
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
