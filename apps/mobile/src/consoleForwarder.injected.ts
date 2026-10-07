/**
 * The console forwarder (PLAN ADR-5, "Consequence"): a script string that runs in the WebView, in the
 * main frame, before the page's own code. Strings only: the one-copy test (rule 6) lets a
 * `*.injected.ts` file use browser globals because it exports nothing else. The origin, the text limit and the redaction
 * rules are placeholders that `buildConsoleForwarder` (consoleMessage.ts) fills in; the rules are the parser's own
 * list (`REDACTIONS`) and the limit its `MAX_TEXT_CHARS`, so the two sides cannot drift.
 *
 * Constraints, each unit-tested by running this source in a sandbox (consoleMessage.test.ts):
 *  1. Attaches only when `location.origin` is the app origin.
 *  2. Applies the parser's redaction list (`(access|refresh|dfl)_token`, `code=`, api-key values, bearer tokens, JWT-shaped (whole or cut short) and
 *     `sb_publishable_`/`sb_secret_` strings, and e-mail addresses, before posting.
 *  3. Forwards only `console.error`, uncaught errors and unhandled rejections, as
 *     `{type:'console', level, text}`; text is cut to `MAX_TEXT_CHARS` (500) characters, at most 5 messages per second
 *     and 50 per page load. The native side drops anything whose frame is not on the app
 *     origin before it parses a byte (`messageSize` in `messageWindow.ts`, the first gate of `receiveShellMessage.ts`).
 */
export const CONSOLE_FORWARDER_SOURCE = `(function () {
  var g = globalThis;
  if (g.__iteraConsoleForwarder) return;
  if (location.origin !== __APP_ORIGIN__) return;
  g.__iteraConsoleForwarder = true;

  var MAX_TEXT = __MAX_TEXT_CHARS__;
  var MAX_TOTAL = 50;
  var MAX_PER_SECOND = 5;
  var sent = 0;
  var windowStart = 0;
  var inWindow = 0;
  var RULES = __REDACTION_RULES__;

  function redact(value) {
    var text = String(value);
    for (var i = 0; i < RULES.length; i += 1) text = text.replace(new RegExp(RULES[i][0], RULES[i][1]), RULES[i][2]);
    return text;
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
