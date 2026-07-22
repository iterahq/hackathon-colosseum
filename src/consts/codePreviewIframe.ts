/**
 * The self-contained document for the code-snack preview iframe. Runs INSIDE a
 * `sandbox="allow-scripts"` opaque origin (student code cannot reach the parent
 * app/cookies/storage). Loads vendored React UMD + the Tailwind Play CDN (both
 * same-origin `public/vendor/` assets — no runtime external fetch), then renders
 * the learner's transpiled component on each `itera:code` message. Scope exposed
 * to the code = React + the hooks.
 */
export const CODE_PREVIEW_IFRAME_HTML = [
  '<!doctype html><html><head><meta charset="utf-8" />',
  '<script src="/vendor/react.production.min.js"></script>',
  '<script src="/vendor/react-dom.production.min.js"></script>',
  '<script src="/vendor/tailwind-play-cdn.js"></script>',
  '<style>html,body{margin:0;padding:12px;background:#fff;font-family:ui-sans-serif,system-ui,sans-serif}',
  '#err{color:#dc2626;font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap}</style>',
  '</head><body><div id="root"></div><div id="err"></div>',
  '<script>',
  'var root=null;',
  'function showErr(m){document.getElementById("err").textContent=m;}',
  'window.addEventListener("message",function(e){',
  '  if(!e.data||e.data.type!=="itera:code")return;',
  '  try{',
  '    document.getElementById("err").textContent="";',
  '    var React=window.React;var ReactDOM=window.ReactDOM;',
  '    var exports={};var module={exports:exports};',
  '    var fn=new Function("React","useState","useEffect","useRef","useMemo","useCallback","exports","module",e.data.code);',
  '    fn(React,React.useState,React.useEffect,React.useRef,React.useMemo,React.useCallback,exports,module);',
  '    var Comp=module.exports&&module.exports.default?module.exports.default:module.exports;',
  '    if(typeof Comp!=="function"){showErr("Seu componente precisa de um export default.");return;}',
  '    if(!root)root=ReactDOM.createRoot(document.getElementById("root"));',
  '    root.render(React.createElement(Comp));',
  '  }catch(err){showErr(String(err&&err.message?err.message:err));}',
  '});',
  'window.parent.postMessage({type:"itera:ready"},"*");',
  '</script></body></html>',
].join('');
