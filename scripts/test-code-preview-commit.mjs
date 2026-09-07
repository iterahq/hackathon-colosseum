import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { CODE_PREVIEW_IFRAME_HTML } from '../packages/activities/dist/code/codePreviewIframe.js';

// Exercise the exact runtime document and vendored React. Delay only React's
// browser scheduler callback: rAF/timers can run before that callback commits.
const schedulerDelay = `<script>(function () {
  var NativeMessageChannel = window.MessageChannel;
  window.MessageChannel = function () {
    var channel = new NativeMessageChannel();
    var send = channel.port2.postMessage.bind(channel.port2);
    channel.port2.postMessage = function (value) {
      setTimeout(function () { send(value); }, 150);
    };
    return channel;
  };
})();</script>`;
const html = CODE_PREVIEW_IFRAME_HTML.replace('<head>', '<head>' + schedulerDelay).replace(
  /<script src="\/vendor\/([^\"]+)"><\/script>/g,
  (_, name) => name.startsWith('tailwind') ? '' :
    `<script>${readFileSync(new URL('../public/vendor/' + name, import.meta.url), 'utf8')}</script>`,
);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent(html);
  await page.evaluate(() => {
    window.checkReceipts = [];
    window.addEventListener('message', event => {
      if (event.data.type === 'itera:checks') window.checkReceipts.push({
        ...event.data, rootChildren: document.getElementById('root').childElementCount,
      });
    });
  });
  const checks = [
    { id: 'title', selector: 'h1', assert: { type: 'exists' } },
    { id: 'button', selector: 'button', assert: { type: 'text', contains: 'Gostei' } },
    { id: 'first-click', steps: [{ do: 'click', selector: 'button' }], selector: 'button', assert: { type: 'text', equals: 'Gostei 1' } },
    { id: 'isolated-click', steps: [{ do: 'click', selector: 'button' }], selector: 'button', assert: { type: 'text', equals: 'Gostei 1' } },
    { id: 'missing-form', selector: 'form', assert: { type: 'exists' } },
  ];
  const code = `module.exports.default = function App() {
    var state = React.useState(0); var count = state[0]; var setCount = state[1];
    return React.createElement('div', null,
      React.createElement('h1', null, 'Title'),
      React.createElement('button', {onClick: function () {setCount(count + 1);}}, 'Gostei ' + count));
  };`;
  await page.evaluate(({code, checks}) => window.postMessage({
    type: 'itera:run-checks', token: 42, code, checks,
  }, '*'), {code, checks});
  await page.waitForFunction(() => window.checkReceipts.length === 1, null, {timeout: 15000});
  const receipt = await page.evaluate(() => window.checkReceipts[0]);
  assert.equal(receipt.token, 42);
  assert.equal(receipt.rootChildren, 1, 'the checked component must be mounted');
  assert.deepEqual(receipt.results, checks.map((check) => ({id: check.id, passed: check.id !== 'missing-form'})));
  assert.deepEqual(errors, [], 'the runtime must emit no page errors');
  console.log('PASS: delayed React scheduler, committed initial DOM, two isolated remounts, and a real failing selector');
} finally {
  await browser.close();
}
