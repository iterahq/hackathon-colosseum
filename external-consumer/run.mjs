/**
 * THE EXTERNAL-CONSUMER PROOF.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE IN-REPO TESTS DO NOT COUNT AS THIS
 * ═══════════════════════════════════════════════════════════════════════════
 * `src/test/activityPublicContract.test.ts` imports `@iterahq/activities` and
 * has done since Fase B — and it proved nothing about external use, because it
 * runs INSIDE the monorepo, under the app's Vite/Vitest resolver, from the
 * workspace symlink, with the app's tsconfig, its `@/` alias, its `.npmrc`, its
 * React, and its 625 installed packages on disk. Every one of those is a
 * borrowed condition an outside app does not have. A green there answers "does
 * the code compile next to the code it came from", which was never the
 * question.
 *
 * This harness removes each borrowed condition ON PURPOSE:
 *
 *  1. **A PACKED TARBALL, not the source tree.** `npm pack` is run on the
 *     workspace and THAT artifact is installed here. So `files`, `exports`,
 *     `main`, `types` and the shape of `dist/` are all exercised — the class of
 *     bug where a package "works" in the repo and 404s on `import` for everyone
 *     else. Nothing here can reach `packages/activities/src`.
 *  2. **Its own `node_modules`.** React, ReactDOM and jsdom are this project's,
 *     not the app's, and `@iterahq/activities` must pull its own runtime
 *     dependencies (`lucide-react`, `framer-motion`) through its manifest. If
 *     one of them were only in the app's tree — the classic phantom
 *     dependency — the import fails here and nowhere else.
 *  3. **No bundler and no TypeScript.** Plain Node ESM, plain
 *     `React.createElement`. A Vite alias, a tsconfig `paths` entry or a JSX
 *     transform cannot participate in the result.
 *  4. **No Itera anything.** No `@/i18n`, no `AuthContext`, no supabase client,
 *     no Tailwind build, no router. The host is ~40 lines of stubs, which is
 *     the actual claim being tested: an app that is not the Player can render
 *     an activity.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `fetch` IS SABOTAGED, AND THAT IS A TEST
 * ═══════════════════════════════════════════════════════════════════════════
 * ADR-3 says the package never calls a backend — it receives ports. An absence
 * is hard to assert, so instead of asserting it, this harness makes the
 * forbidden thing FAIL LOUD: `fetch`, `XMLHttpRequest` and `navigator.sendBeacon`
 * all throw. If any renderer ever reaches for the Itera API, the run goes red
 * with the URL in the message, instead of silently succeeding against a backend
 * that happens to be unreachable in CI anyway.
 *
 * Exit code is the verdict: 0 = every check passed, 1 = at least one failed.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

/* ─────────────────────────── a browser, minimally ────────────────────────── */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://an-app-that-is-not-the-player.example/',
  pretendToBeVisual: true,
});

// `defineProperty`, not assignment: Node >= 21 defines `globalThis.navigator`
// as a getter-only accessor, so `globalThis.navigator = …` throws. Assignment
// works on Node 20 and fails on 24 — i.e. it would pass in CI and break for
// anyone running this locally on a current Node.
const expose = (name, value) =>
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });

// Copy jsdom's globals wholesale rather than listing the ones we think are
// needed. Hand-listing looked tidier and was wrong twice in a row: React wanted
// `Node`, then framer-motion wanted `SVGElement` from three frames deep. The
// list is not knowable from here — it is whatever the package's dependencies
// touch — and every miss reads as "the extraction is broken" when it is really
// "this harness is not a browser yet". Existing Node globals win, so `console`,
// `process` and our own `fetch` trap below are not clobbered.
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (key in globalThis) continue;
  const desc = Object.getOwnPropertyDescriptor(dom.window, key);
  if (!desc) continue;
  try {
    Object.defineProperty(globalThis, key, { ...desc, configurable: true });
  } catch {
    /* a handful of jsdom accessors refuse to be redefined; none are load-bearing */
  }
}

expose('window', dom.window);
expose('document', dom.window.document);
expose('navigator', dom.window.navigator);
expose('localStorage', dom.window.localStorage);
expose('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0));
expose('cancelAnimationFrame', (id) => clearTimeout(id));
// jsdom ships no matchMedia; a real browser has one. framer-motion's
// `useReducedMotion` asks for it. This is host responsibility, not a package gap.
dom.window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
});
expose('matchMedia', dom.window.matchMedia);
expose('IS_REACT_ACT_ENVIRONMENT', true);

/* ── the network is a trap: any call is a failed test, not a failed request ── */

const networkAttempts = [];
function trap(what) {
  return (...args) => {
    const detail = `${what}(${String(args[0]).slice(0, 200)})`;
    networkAttempts.push(detail);
    throw new Error(`ADR-3 violation: the package tried to reach the network — ${detail}`);
  };
}
expose('fetch', trap('fetch'));
dom.window.fetch = globalThis.fetch;
dom.window.XMLHttpRequest = function () {
  trap('XMLHttpRequest')('<open>');
};
dom.window.navigator.sendBeacon = trap('sendBeacon');

/* ────────────────────────────── the imports ──────────────────────────────── */

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const pkg = await import('@iterahq/activities');

const {
  ActivityProvider,
  ActivityRenderer,
  BUILT_IN_ACTIVITY_KINDS,
  createActivityI18n,
  isBuiltInActivityKind,
} = pkg;

const h = React.createElement;
const FIXTURES = JSON.parse(
  readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'),
);

/* ────────────────────────────── tiny test kit ────────────────────────────── */

let failures = 0;
let checks = 0;
function check(name, fn) {
  checks += 1;
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function section(title) {
  console.log(`\n${title}`);
}

/* ────────────────────── mount / interact, no test lib ────────────────────── */

function mount(element) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    text: () => container.textContent ?? '',
    all: (sel) => [...container.querySelectorAll(sel)],
    one: (sel) => container.querySelector(sel),
    click: (el) => {
      assert(el, 'tried to click an element that is not there');
      act(() => {
        el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      });
    },
    unmount: () => act(() => root.unmount()),
  };
}

/** The host: a locale, an opaque learner id, and a telemetry sink. That is all. */
function host(children, { onEvent, i18n } = {}) {
  return h(
    ActivityProvider,
    {
      i18n: i18n ?? createActivityI18n('pt'),
      identity: { authenticated: false, userId: 'external-consumer-learner' },
      onEvent,
    },
    children,
  );
}

function renderKind(name, props = {}) {
  const activity = FIXTURES[name];
  assert(activity, `no fixture for ${name}`);
  const events = [];
  const completions = [];
  const view = mount(
    host(
      h(ActivityRenderer, {
        activity,
        onComplete: (correct, detail) => completions.push({ correct, detail }),
        ...props,
      }),
      { onEvent: (e) => events.push(e) },
    ),
  );
  return { view, events, completions, activity };
}

/* ══════════════════════════════ the checks ═══════════════════════════════ */

console.log('external consumer — @iterahq/activities, installed from a packed tarball');
console.log(`node ${process.version} · cwd ${fileURLToPath(new URL('.', import.meta.url))}`);

section('1. the package resolves and exposes its documented surface');

check('imports as ESM from Node with no bundler', () => {
  assert(typeof ActivityRenderer === 'function', 'ActivityRenderer is not a component');
  assert(typeof ActivityProvider === 'function', 'ActivityProvider is not a component');
});

check('does NOT leak its internals through the barrel', () => {
  // The public API is a promise. These are implementation, and a consumer that
  // could reach them would pin the implementation by using them.
  for (const leaked of ['useLearnerScope', 'useActivityEmitter', 'ACTIVITY_HOST_CTX']) {
    assert(!(leaked in pkg), `${leaked} is exported and should not be`);
  }
});

check('advertises the kinds it can render, and only those', () => {
  assert(Array.isArray(BUILT_IN_ACTIVITY_KINDS), 'BUILT_IN_ACTIVITY_KINDS missing');
  for (const kind of BUILT_IN_ACTIVITY_KINDS) {
    assert(isBuiltInActivityKind(kind), `${kind} advertised but not dispatchable`);
    assert(FIXTURES[kind], `${kind} advertised but this harness has no fixture for it`);
  }
  assert(!isBuiltInActivityKind('sandbox_scenario'), 'claims a kind it did not extract');
});

section('2. every advertised kind renders from a fixture spec');

for (const kind of BUILT_IN_ACTIVITY_KINDS) {
  check(`${kind} renders real content`, () => {
    const { view } = renderKind(kind);
    const shell = view.one('[data-testid="activity-shell"]');
    assert(shell, 'no activity shell in the output');
    assert(
      shell.getAttribute('data-activity-kind') === kind,
      `shell says ${shell.getAttribute('data-activity-kind')}, expected ${kind}`,
    );
    assert(view.text().trim().length > 0, 'rendered nothing');
    view.unmount();
  });
}

check('the instruction text of the spec actually reaches the DOM', () => {
  const { view } = renderKind('concept');
  assert(
    view.text().includes('guarda um instante do projeto'),
    'the authored instruction is not on screen',
  );
  // …and the light-markdown parser travelled with it.
  assert(view.one('strong'), '**bold** did not become <strong> — the parser did not come along');
  view.unmount();
});

check('choice options render with their AUTHORED ids, not positions', () => {
  const { view } = renderKind('single_choice');
  const ids = view.all('[data-testid="single-choice-option"]').map((el) =>
    el.getAttribute('data-option-id'),
  );
  assert(ids.length === 4, `expected 4 options, got ${ids.length}`);
  assert(ids.every(Boolean), 'an option rendered without data-option-id');
  view.unmount();
});

section('3. the learner can answer, and the verdict comes back');

check('single_choice: pick + submit ⇒ onComplete(true) with the answer', () => {
  const { view, completions } = renderKind('single_choice');
  const correct = view
    .all('[data-testid="single-choice-option"]')
    .find((el) => el.getAttribute('data-option-id') === 'opt-commit');
  view.click(correct);
  view.click(view.one('[data-testid="single-choice-submit"]'));

  assert(completions.length === 1, `onComplete fired ${completions.length} times, expected 1`);
  assert(completions[0].correct === true, 'the right answer was graded wrong');
  assert(completions[0].detail?.response === 'git commit', 'the answer text did not come up');
  view.unmount();
});

check('single_choice: a wrong pick grades false', () => {
  const { view, completions } = renderKind('single_choice');
  const wrong = view
    .all('[data-testid="single-choice-option"]')
    .find((el) => el.getAttribute('data-option-id') === 'opt-push');
  view.click(wrong);
  view.click(view.one('[data-testid="single-choice-submit"]'));
  assert(completions[0]?.correct === false, 'a wrong answer was graded correct');
  view.unmount();
});

check('the action SEQUENCE rides up with the verdict', () => {
  const { view, completions } = renderKind('single_choice');
  const opts = view.all('[data-testid="single-choice-option"]');
  view.click(opts[0]);
  view.click(opts[1]); // changed their mind — the HOW, not just the WHAT
  view.click(view.one('[data-testid="single-choice-submit"]'));

  const actions = completions[0]?.detail?.actions ?? [];
  const types = actions.map((a) => a.type);
  assert(types.filter((t) => t === 'option_selected').length === 2, `got ${types.join(',')}`);
  assert(types[types.length - 1] === 'answer_submitted', 'no terminal action');
  assert(
    actions.every((a) => typeof a.at === 'number' && a.at > 0),
    'an action has no wall-clock stamp',
  );
  view.unmount();
});

section('4. telemetry reaches the host (ADR-4)');

check('emits activity.viewed on mount and activity.completed on settle', () => {
  const { view, events } = renderKind('single_choice');
  assert(
    events.some((e) => e.type === 'activity.viewed' && e.activityId === 'fixture-single-choice'),
    `no activity.viewed — got ${events.map((e) => e.type).join(',') || '(none)'}`,
  );
  const correct = view
    .all('[data-testid="single-choice-option"]')
    .find((el) => el.getAttribute('data-option-id') === 'opt-commit');
  view.click(correct);
  view.click(view.one('[data-testid="single-choice-submit"]'));
  const completed = events.find((e) => e.type === 'activity.completed');
  assert(completed, 'no activity.completed');
  assert(completed.payload?.correct === true, 'the event lost the verdict');
  assert(completed.kind === 'single_choice', 'the event lost the kind');
  view.unmount();
});

section('5. ADR-1 — an activity, not the player');

check('no bottom bar, no progress, no hearts, no navigation', () => {
  const chrome = [
    '[data-testid="feedback-footer"]',
    '[data-testid="lesson-progress"]',
    '[data-testid="hearts"]',
    '[data-testid="lesson-close"]',
    'nav',
    'a[href]',
  ];
  for (const kind of BUILT_IN_ACTIVITY_KINDS) {
    const { view } = renderKind(kind);
    for (const sel of chrome) {
      assert(!view.one(sel), `${kind} rendered player chrome: ${sel}`);
    }
    view.unmount();
  }
});

section('6. ADR-3 — no backend, and no port means degrade, not throw');

check('rendering and answering touched the network ZERO times', () => {
  // The traps throw, so a violation would already have failed a check above.
  // This asserts the tally directly, so "no check happened to trigger it" and
  // "it never happens" are not confused.
  assert(
    networkAttempts.length === 0,
    `the package attempted ${networkAttempts.length}: ${networkAttempts.join('; ')}`,
  );
});

check('a kind the package did not extract degrades visibly, without throwing', () => {
  const { view, events } = renderKind('sandbox_scenario');
  const placeholder = view.one('[data-unsupported-kind="true"]');
  assert(placeholder, 'an unsupported kind should render a placeholder, not vanish');
  assert(
    events.some((e) => e.type === 'port.unavailable'),
    'the gap was not reported to the host',
  );
  view.unmount();
});

check('a host CAN supply the missing kind itself', () => {
  const marker = 'rendered-by-the-host';
  const HostKind = ({ activity }) =>
    h('div', { 'data-testid': marker }, `host renders ${activity.kind}`);
  const view = mount(
    h(
      ActivityProvider,
      {
        i18n: createActivityI18n('pt'),
        renderers: { sandbox_scenario: HostKind },
      },
      h(ActivityRenderer, { activity: FIXTURES.sandbox_scenario, onComplete: () => {} }),
    ),
  );
  assert(view.one(`[data-testid="${marker}"]`), 'the host renderer was ignored');
  view.unmount();
});

section('7. i18n — words out of the box, and the host still wins');

check('with only a locale, the learner sees Portuguese, not translation keys', () => {
  const { view } = renderKind('single_choice');
  const text = view.text();
  assert(!text.includes('activity.'), `a raw translation key reached the screen: ${text.slice(0, 120)}`);
  assert(text.includes('Enviar'), 'the submit label did not resolve');
  assert(text.includes('Escolha única'), 'the kind badge did not resolve');
  view.unmount();
});

check('English is a one-argument change', () => {
  const activity = FIXTURES.single_choice;
  const view = mount(
    host(h(ActivityRenderer, { activity, onComplete: () => {} }), {
      i18n: createActivityI18n('en'),
    }),
  );
  assert(view.text().includes('Submit'), 'en locale did not take');
  view.unmount();
});

check("a host's own translation overrides the package's", () => {
  const activity = FIXTURES.single_choice;
  const view = mount(
    host(h(ActivityRenderer, { activity, onComplete: () => {} }), {
      i18n: {
        locale: 'pt',
        t: (key) => (key === 'activity.submit' ? 'MANDAR BRASA' : key),
        tText: () => '',
      },
    }),
  );
  assert(view.text().includes('MANDAR BRASA'), 'the host translation was ignored');
  // …and the keys the host did NOT translate still fall back per key, so a
  // partially translated host does not get a screen half in translation keys.
  assert(view.text().includes('Escolha única'), 'per-key fallback did not apply');
  view.unmount();
});

section('8. the shuffle is per-learner, outside the Player too');

check('two learner ids produce two different arrangements', () => {
  const order = (userId) => {
    const view = mount(
      h(
        ActivityProvider,
        { i18n: createActivityI18n('pt'), identity: { authenticated: true, userId } },
        h(ActivityRenderer, { activity: FIXTURES.single_choice, onComplete: () => {} }),
      ),
    );
    const ids = view
      .all('[data-testid="single-choice-option"]')
      .map((el) => el.getAttribute('data-option-id'));
    view.unmount();
    return ids;
  };
  const a = order('learner-a');
  const b = order('learner-b');
  assert(a.length === 4 && b.length === 4, 'options went missing');
  assert([...a].sort().join() === [...b].sort().join(), 'the two learners saw different options');
  assert(a.join() !== b.join(), 'both learners saw the SAME order — the shuffle is not seeded');
  // Deterministic for one learner: this is the property the Player relies on.
  assert(order('learner-a').join() === a.join(), 'the same learner got two different orders');
});

/* ═════════════════════════════════ verdict ════════════════════════════════ */

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`\nEXTERNAL CONSUMER CHECK FAILED — ${failures} failing`);
  process.exit(1);
}
console.log('EXTERNAL CONSUMER CHECK PASSED');
