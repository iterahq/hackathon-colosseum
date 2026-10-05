/**
 * The console forwarder (PLAN ADR-5, "Consequence"): a script string that runs in the WebView, in the
 * main frame, before the page's own code. Strings only: the one-copy test (rule 6) lets a
 * `*.injected.ts` file use browser globals because it exports nothing else. The origin is a
 * placeholder that `buildConsoleForwarder` (consoleMessage.ts) fills in.
 *
 * Constraints, each unit-tested by running this source in a sandbox (consoleMessage.test.ts):
 *  1. Attaches only when `location.origin` is the app origin.
 *  2. Redacts `(access|refresh|dfl)_token` and api-key values, bearer tokens, JWT-shaped and
 *     `sb_publishable_`/`sb_secret_` strings, and e-mail addresses, before posting.
 *  3. Forwards only `console.error`, uncaught errors and unhandled rejections, as
 *     `{type:'console', level, text}`; text is cut to 500 characters, at most 5 messages per second
 *     and 50 per page load. The native `onMessage` drops anything whose frame is not on the app
 *     origin (parseConsoleMessage).
 */
export const CONSOLE_FORWARDER_SOURCE = `(function () {
  var g = globalThis;
  if (g.__iteraConsoleForwarder) return;
  if (location.origin !== __APP_ORIGIN__) return;
  g.__iteraConsoleForwarder = true;

  var MAX_TEXT = 500;
  var MAX_TOTAL = 50;
  var MAX_PER_SECOND = 5;
  var sent = 0;
  var windowStart = 0;
  var inWindow = 0;
  var SECRET = /((?:access|refresh|dfl)_token["']?\\s*[:=]\\s*["']?)[^&\\s"',}#]+/gi;
  var JWT = /eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+/g;
  var API_KEY = /(api[_-]?key["']?\\s*[:=]\\s*["']?)[^&\\s"',}#]+/gi;
  var OPAQUE_KEY = /sb_(?:publishable|secret)_[\\w-]+/g;
  var BEARER = /(bearer\\s+)[A-Za-z0-9._~+\\/=-]{16,}/gi;
  var EMAIL = /[\\w.+-]+@[\\w-]+\\.[\\w.-]+/g;

  function redact(value) {
    return String(value)
      .replace(SECRET, '$1[redacted]')
      .replace(API_KEY, '$1[redacted]')
      .replace(BEARER, '$1[redacted]')
      .replace(JWT, '[redacted]')
      .replace(OPAQUE_KEY, '[redacted]')
      .replace(EMAIL, '[email]');
  }

  function describe(arg) {
    if (typeof arg === 'string') return arg;
    if (arg && typeof arg === 'object' && typeof arg.message === 'string') return String(arg.name || 'Error') + ': ' + arg.message;
    try {
      var json = JSON.stringify(arg);
      return json === undefined ? String(arg) : json;
    } catch (e) {
      return '[unserializable]';
    }
  }

  function post(level, text) {
    var now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      inWindow = 0;
    }
    if (sent >= MAX_TOTAL || inWindow >= MAX_PER_SECOND) return;
    sent += 1;
    inWindow += 1;
    try {
      var bridge = g.ReactNativeWebView;
      if (!bridge || typeof bridge.postMessage !== 'function') return;
      bridge.postMessage(JSON.stringify({ type: 'console', level: level, text: redact(text).slice(0, MAX_TEXT) }));
    } catch (e) {}
  }

  var original = console.error;
  console.error = function () {
    var parts = [];
    for (var i = 0; i < arguments.length; i += 1) parts.push(describe(arguments[i]));
    post('error', parts.join(' '));
    return original.apply(console, arguments);
  };

  g.addEventListener('error', function (event) {
    post('uncaught', (event && event.message) || 'error');
  });
  g.addEventListener('unhandledrejection', function (event) {
    post('rejection', describe(event && event.reason));
  });
})();
true;
`;
