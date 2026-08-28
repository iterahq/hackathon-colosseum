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
/**
 * The SECOND entrypoint (ADR-5). Importing it here, in the same process, is
 * itself part of the proof: `exports["./code"]` has to resolve from a packed
 * tarball with no bundler, and the transpiler it pulls (`sucrase`) has to come
 * through this package's own manifest — there is no app tree to borrow it from.
 */
const codePkg = await import('@iterahq/activities/code');

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
/** Same, for a check that has to wait on real time (a debounce, say). */
async function checkAsync(name, fn) {
  checks += 1;
  try {
    await fn();
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

/**
 * Type a line into the terminal and press Enter.
 *
 * React tracks the DOM value on the node itself, so setting `el.value` and
 * firing `input` is ignored — the synthetic event arrives with the OLD value
 * and the keystroke is silently dropped. The native setter is how you tell
 * React the value really changed. Without this the sandbox check would pass on
 * an empty command line and prove nothing.
 */
function typeAndEnter(view, el, line) {
  const setter = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value',
  ).set;
  act(() => {
    setter.call(el, line);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  act(() => {
    el.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
}

/**
 * Set a controlled input/textarea's value the way a keystroke would.
 *
 * Same reason as `typeAndEnter`: React tracks the DOM value on the node, so a
 * plain `el.value = x` is discarded and the component never sees the edit.
 */
function setValue(el, value) {
  const proto =
    el.tagName === 'TEXTAREA'
      ? dom.window.HTMLTextAreaElement.prototype
      : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

/**
 * Stand in for the preview's sandboxed iframe, over its real message protocol.
 *
 * jsdom renders `<iframe sandbox="allow-scripts" srcDoc>` and never executes a
 * line of it, so the document inside stays silent forever. This captures what
 * the parent posts INTO the frame and posts the answers back OUT, with
 * `event.source` set to the frame's own window — which is exactly the check
 * `CodeLivePreview` uses to refuse messages from anywhere else.
 *
 * It is a stand-in for the SANDBOX, not for the package: everything on the
 * parent side (the ready gate, the transpile, the token echo, the verdict
 * reconciliation against the authored check list) is the shipped code.
 */
function previewSandbox(view) {
  const frame = view.one('[data-testid="code-preview-iframe"]');
  assert(frame, 'the code kind rendered no preview iframe');
  const source = frame.contentWindow;
  assert(source, 'the preview iframe has no contentWindow');
  const posted = [];
  source.postMessage = (message) => posted.push(message);
  const deliver = (data) => {
    act(() => {
      dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, source }));
    });
  };
  return {
    posted,
    get runs() {
      return posted.filter((m) => m.type === 'itera:run-checks');
    },
    boot: () => deliver({ type: 'itera:ready' }),
    answer(results, token) {
      const runs = posted.filter((m) => m.type === 'itera:run-checks');
      deliver({ type: 'itera:checks', results, token: token ?? runs[runs.length - 1]?.token });
    },
  };
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
  assert(!isBuiltInActivityKind('code'), 'claims a kind it did not extract');
});

section('2. every advertised kind renders from a fixture spec');

/**
 * ⚠️ `quiz` IS THE ONE KIND WITH NO `activity-shell`, AND THAT IS THE DESIGN.
 *
 * Every other kind renders inside the rounded card `ActivityShell` draws. The
 * quiz is the hero: it IS the screen, so a card around it would put a border
 * around the whole page. It therefore carries `data-testid="activity-quiz"` at
 * its root instead.
 *
 * The check below reads the ROOT for each kind rather than hard-coding the
 * shell, so it still asserts the same thing — something rendered, and it
 * declares the kind it was asked for — without demanding a wrapper the design
 * deliberately omits. Special-casing it with an `if (kind === 'quiz') return`
 * would have skipped the assertion instead of adjusting it.
 */
const KIND_ROOT = {
  quiz: '[data-testid="activity-quiz"]',
};

for (const kind of BUILT_IN_ACTIVITY_KINDS) {
  check(`${kind} renders real content`, () => {
    const { view } = renderKind(kind);
    const root = view.one(KIND_ROOT[kind] ?? '[data-testid="activity-shell"]');
    assert(root, 'no activity root in the output');
    assert(
      root.getAttribute('data-activity-kind') === kind,
      `root says ${root.getAttribute('data-activity-kind')}, expected ${kind}`,
    );
    assert(view.text().trim().length > 0, 'rendered nothing');
    view.unmount();
  });
}

/*
 * The three kinds Fase D brought across. They were inline functions in the
 * Itera Player's dispatcher until 0.4.0, so an external consumer could not
 * render them at all — and they are 48% of the authored library, which is why
 * they get content assertions of their own rather than only the generic root
 * check above.
 */

check('document: the reflection variant is a REAL input, not a prompt and a button', () => {
  // The failure this pins is a real one from the Player's history: the document
  // once rendered its prompt plus a "mark done" button and NO textarea, so the
  // activity asked a question the learner had nowhere to answer.
  const { view } = renderKind('document');
  assert(view.one('[data-testid="document-reflection-input"]'), 'no textarea to write in');
  assert(view.text().includes('o que você aprendeu'), 'the authored prompt is not on screen');
  assert(view.one('strong'), '**bold** did not become <strong> in the prompt');
  view.unmount();
});

check('document: no `api.judge` degrades to reflection instead of throwing', () => {
  // ADR-3 in its most concrete form. This harness supplies NO api port at all,
  // so the assertion above already exercises the degraded path — this one says
  // so explicitly, and pins that the AI-judge surface is genuinely absent
  // rather than present-and-broken.
  const { view } = renderKind('document');
  assert(!view.one('[data-testid="judge-submit"]'), 'offered an AI judge with no judge port');
  assert(!view.one('[data-testid="judge-heatmap"]'), 'rendered a verdict panel with no judge');
  view.unmount();
});

check('diagram: the highlights render, and the mermaid source is not swallowed', () => {
  const { view } = renderKind('diagram');
  const highlights = view.one('[data-testid="diagram-highlights"]');
  assert(highlights, 'the authored highlights are missing');
  assert(view.text().includes('HEAD'), 'a highlighted term did not reach the DOM');
  assert(view.text().includes('onde você está agora'), 'a highlight caption is missing');
  view.unmount();
});

check('quiz: options carry their authored text, and the eyebrow is the 2-option default', () => {
  const { view } = renderKind('quiz');
  const options = view.all('[data-testid="quiz-option"]').map((el) => el.textContent.trim());
  assert(options.length === 2, `expected 2 options, got ${options.length}`);
  assert(options.includes('Falso'), 'an authored option label is missing');
  // A two-option quiz with no authored `label` falls back to the canonical
  // true/false eyebrow — and it comes from the package's OWN dictionary here,
  // since this host injects only a locale.
  const eyebrow = view.one('[data-testid="quiz-eyebrow"]');
  assert(eyebrow, 'no eyebrow above the question');
  assert(
    eyebrow.textContent.trim() === 'Verdadeiro ou falso?',
    `eyebrow said "${eyebrow.textContent.trim()}"`,
  );
  view.unmount();
});

check('quiz: a wrong pick grades false AND shows the authored explanation', () => {
  // The quiz is the only kind whose contract DECLARES `explanation`, and it is
  // shown only on a wrong answer — getting it right and being told why is not
  // the moment a beginner needs it. Grading keys on `options[].isCorrect`, not
  // on a top-level `correct_option_id`, which is why the quiz is its own kind.
  const { view, completions } = renderKind('quiz');
  const wrong = view
    .all('[data-testid="quiz-option"]')
    .find((el) => el.textContent.trim() === 'Verdadeiro');
  view.click(wrong);
  view.click(view.one('[data-testid="quiz-submit"]'));

  assert(completions.length === 1, `onComplete fired ${completions.length} times, expected 1`);
  assert(completions[0].correct === false, 'the wrong answer was graded right');
  assert(completions[0].detail?.response === 'Verdadeiro', 'the chosen option did not come up');
  assert(view.one('[data-testid="answer-explanation"]'), 'no explanation after a wrong answer');
  view.unmount();
});

/*
 * `question` (1.2.0) — the first kind here that NEVER GRADES.
 *
 * It gets assertions of its own for the same reason Fase D's three did, but the
 * property under test is different: every other kind is checked for what it
 * DRAWS, and this one has to be checked for what it MUST NOT — a verdict.
 */

check('question: no verdict, before or after answering', () => {
  const { view, completions } = renderKind('question');

  // Before: the recommendation is a MARKER and it is already there.
  const marker = view.one('[data-testid="question-recommended"]');
  assert(marker, 'the ★ recomendado marker is missing');
  assert(
    view.one('[data-recommended="true"]')?.getAttribute('data-option-id') === 'keep',
    'the marker is on the wrong option',
  );

  const swap = view
    .all('[data-testid="question-option"]')
    .find((el) => el.getAttribute('data-option-id') === 'swap');
  view.click(swap);
  view.click(view.one('[data-testid="question-submit"]'));

  // After: settled, and STILL no verdict. `data-correct` is what `SubmitButton`
  // stamps when it is told a grade; this kind never tells it one, so a green or
  // red button here would mean an opinion had been marked right or wrong.
  const submit = view.one('[data-testid="question-submit"]');
  assert(submit.getAttribute('data-submitted') === 'true', 'the submit did not settle');
  assert(submit.getAttribute('data-correct') === null, 'a verdict was drawn on a question');
  assert(completions.length === 1, `onComplete fired ${completions.length} times, expected 1`);
  view.unmount();
});

/** The terminal `answer_submitted` of the last completion — the machine-readable half. */
function settledPayload(completions) {
  const settled = completions[0].detail.actions.find((a) => a.type === 'answer_submitted');
  assert(settled, 'no answer_submitted in the trace');
  return settled.payload;
}

check('question: the marked option travels as an AUTHORED id in the trace', () => {
  const { view, completions } = renderKind('question');
  view.click(
    view.all('[data-testid="question-option"]').find(
      (el) => el.getAttribute('data-option-id') === 'flag',
    ),
  );
  view.click(view.one('[data-testid="question-submit"]'));

  const payload = settledPayload(completions);
  assert(payload.option_ids.includes('flag'), 'the marked option is not in the payload');
  assert(payload.other === false, 'the `other` flag was set without anyone touching it');

  // 🚨 THE PRIVACY INVARIANT. `PAYLOADS_CARRY_NO_FREE_TEXT`: a trace payload
  // says WHICH thing was touched and WHEN, never WHAT was written. If a `text`
  // key ever appears here, the answer text has two homes and two purge paths.
  assert(!('text' in payload), 'the free text leaked into the trace payload');
  assert(payload.has_text === false, 'has_text claims text nobody typed');
  view.unmount();
});

check('question: in `single` mode, "Outro" REPLACES the option — it is the choice', () => {
  // Not a quirk of the toggle: a single-mode answer names ONE thing, so leaving
  // an authored option marked beside "Outro" would submit two. The free text
  // and the other axes are untouched, because they are a different axis of the
  // same answer — clearing them would silently delete what someone wrote.
  const { view, completions } = renderKind('question');
  view.click(
    view.all('[data-testid="question-option"]').find(
      (el) => el.getAttribute('data-option-id') === 'flag',
    ),
  );
  view.click(view.one('[data-testid="question-other"]'));
  assert(
    !view.one('[data-testid="question-option"][data-selected="true"]'),
    'an authored option stayed marked beside "Outro" in single mode',
  );
  view.click(view.one('[data-testid="question-submit"]'));

  const payload = settledPayload(completions);
  assert(payload.other === true, 'the `other` flag did not travel');
  // The sentinel rides INSIDE `option_ids` so the payload round-trips through
  // the plans-app `selected_option_letters[]` with no translation step.
  assert(payload.option_ids.includes('OTHER'), 'the OTHER sentinel is missing');
  assert(!payload.option_ids.includes('flag'), 'the replaced option came back in the payload');
  view.unmount();
});

check('question: the free-text field is always there, and its labels come from the spec', () => {
  // There is deliberately NO spec field that hides it — an author who turns text
  // off does not stop people having something to say, only recording it.
  const { view } = renderKind('question');
  const box = view.one('[data-testid="question-text"]');
  assert(box, 'the free-text field is missing');
  assert(box.getAttribute('placeholder') === 'O que muda a sua escolha?', 'the authored placeholder is missing');
  assert(view.text().includes('Notas (opcional)'), 'the authored label is not on screen');
  // The rationale under each option — the field no choice kind has.
  assert(
    view.text().includes('Zero regressão'),
    'an option description did not reach the DOM',
  );
  view.unmount();
});

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

check('terminal_sandbox: N turns against a world model, graded by the spec', () => {
  // The first kind here that is not a single-submit question. It matters as an
  // external-consumer check precisely because it is the one with a RUNTIME:
  // `@iterahq/activity-spec/runtime` reduces the command, the engine prints
  // output, the step unlocks and the scenario's own `success` predicate decides
  // the verdict — all of it inside a host that supplies nothing but a locale.
  //
  // It drove the old single sandbox kind until activity-spec 0.12.0, where that
  // kind became an alias of the CHAT schema — so this terminal spec no longer
  // parses under it, and `terminal_sandbox` is the only kind it can be.
  const { view, completions, events } = renderKind('terminal_sandbox');

  const input = view.one('[data-testid="terminal-input"]');
  assert(input, 'the terminal never rendered its prompt');
  assert(view.text().includes('Crie perfil.md'), 'the authored step prompt is not on screen');

  // A WRONG command first: it must produce output and NOT settle the activity.
  typeAndEnter(view, input, 'git status');
  assert(completions.length === 0, 'a non-matching command settled the activity');

  typeAndEnter(view, input, 'touch perfil.md');

  assert(completions.length === 1, `onComplete fired ${completions.length} times, expected 1`);
  assert(completions[0].correct === true, 'the matching command was graded wrong');
  assert(
    completions[0].detail?.explanation === 'Boa!',
    `the reveal recap did not ride up: ${JSON.stringify(completions[0].detail)}`,
  );

  // The trace is the HOW. Both commands are in it, and the miss is marked as one.
  const runs = (completions[0].detail?.actions ?? []).filter((a) => a.type === 'command_run');
  assert(runs.length === 2, `expected 2 command_run actions, got ${runs.length}`);
  assert(runs[0].payload?.matched === false, 'the wrong command was recorded as a match');
  assert(runs[1].payload?.matched === true, 'the right command was not recorded as a match');

  assert(
    events.some((e) => e.type === 'activity.completed' && e.payload?.correct === true),
    'the host was not told the sandbox settled',
  );
  view.unmount();
});

check('terminal_sandbox: the engine output is localized by the host locale', () => {
  const read = (locale) => {
    const view = mount(
      host(h(ActivityRenderer, { activity: FIXTURES.terminal_sandbox, onComplete: () => {} }), {
        i18n: createActivityI18n(locale),
      }),
    );
    const input = view.one('[data-testid="terminal-input"]');
    typeAndEnter(view, input, 'touch perfil.md');
    const text = view.one('[data-testid="terminal-transcript"]').textContent ?? '';
    view.unmount();
    return text;
  };
  const pt = read('pt');
  const en = read('en');
  // The chrome (`aluno@` vs `student@`) AND the engine's own line ("criado:" vs
  // "created:") both follow the port — the second is the one that proves the
  // locale reaches the runtime and not just the labels.
  assert(pt.includes('aluno@itera'), `pt prompt prefix missing: ${pt.slice(0, 80)}`);
  assert(en.includes('student@itera'), `en prompt prefix missing: ${en.slice(0, 80)}`);
  assert(pt.includes('criado:'), `pt engine output missing: ${pt.slice(0, 120)}`);
  assert(en.includes('created:'), `en engine output missing: ${en.slice(0, 120)}`);
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
  // `code` is the kind that is NOT in the base entrypoint, on purpose: ADR-5
  // keeps Monaco out of the bundle everybody pays for. So a base-only consumer
  // must get the visible, inert placeholder — not a crash, and not silence.
  const { view, events } = renderKind('code');
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
        renderers: { code: HostKind },
      },
      h(ActivityRenderer, { activity: FIXTURES.code, onComplete: () => {} }),
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

section('9. the `code` kind — the other door (ADR-5)');

/**
 * Everything above proves the BASE bundle. This section proves the thing that
 * made the base bundle worth protecting: a consumer who actually wants `code`
 * can have it, from a second entrypoint, without the base ever having known.
 *
 * The mirror-image assertion — that `dist/index.js` cannot reach any of this —
 * is `scripts/assert-entrypoint-isolation.mjs`, which `check.sh` runs over the
 * INSTALLED package right before this file. Two halves of one claim: `/code`
 * works, and the base does not carry it.
 */

const { CodeActivity, CODE_DRAFT_KEY_PREFIX, codeDraftKey } = codePkg;

/** A host that registers the code kind, with whatever ports the check needs. */
function codeHost(children, { storage, codeEditor, onEvent } = {}) {
  return h(
    ActivityProvider,
    {
      i18n: createActivityI18n('pt'),
      identity: { authenticated: false, userId: 'external-consumer-learner' },
      renderers: { code: CodeActivity },
      storage,
      codeEditor,
      onEvent,
    },
    children,
  );
}

function renderCode(opts = {}) {
  const events = [];
  const completions = [];
  const view = mount(
    codeHost(
      h(ActivityRenderer, {
        activity: FIXTURES.code,
        onComplete: (correct, detail) => completions.push({ correct, detail }),
      }),
      { ...opts, onEvent: (e) => events.push(e) },
    ),
  );
  return { view, events, completions };
}

check('the ./code subpath export resolves, and the base still refuses the kind', () => {
  assert(typeof CodeActivity === 'function', 'CodeActivity is not a component');
  assert(!isBuiltInActivityKind('code'), 'the base dispatcher claims `code` after all');
  assert(!('CodeActivity' in pkg), 'the base barrel re-exports the code kind');
  assert(typeof CODE_DRAFT_KEY_PREFIX === 'string', 'the draft-key contract is not exported');
});

check('a host that REGISTERS it renders a real code snack — no editor required', () => {
  // Nothing is injected but the renderer. The package ships no editor (the
  // editor is a port), so what a bare consumer gets is the fallback textarea:
  // a real editing surface, not a placeholder.
  const { view } = renderCode();
  const shell = view.one('[data-testid="activity-shell"]');
  assert(shell?.getAttribute('data-activity-kind') === 'code', 'no code shell rendered');
  const editor = view.one('[data-testid="code-editor"]');
  assert(editor, 'no editing surface — the fallback editor did not render');
  assert(editor.value.includes('Curtir'), 'the editor did not open on the authored starter');
  assert(view.text().includes('Gostei'), 'the authored prompt is not on screen');
  assert(view.one('strong'), '**bold** in the prompt did not survive — the parser did not come along');
  assert(view.one('[data-testid="code-reset"]'), 'the "recomeçar" escape hatch is missing');
  view.unmount();
});

check("a host's own editor wins over the fallback", () => {
  // The seam the Itera Player uses to keep Monaco — and its live-class caret
  // mirroring — inside the app instead of inside this package.
  const HostEditor = ({ value }) => h('div', { 'data-testid': 'host-editor' }, value);
  const { view } = renderCode({ codeEditor: HostEditor });
  assert(view.one('[data-testid="host-editor"]'), 'the injected editor was ignored');
  assert(!view.one('[data-testid="code-editor"]'), 'the fallback rendered anyway');
  view.unmount();
});

check('the graded lifecycle runs end to end: submit, fail, retry, pass, settle', () => {
  const { view, completions, events } = renderCode();
  const sandbox = previewSandbox(view);
  sandbox.boot();

  // Nothing is on screen while editing — no permanent checklist.
  assert(!view.one('[data-testid="code-checks-feedback"]'), 'a verdict before any submit');

  view.click(view.one('[data-testid="code-submit"]'));
  assert(sandbox.runs.length === 1, `expected 1 graded run, got ${sandbox.runs.length}`);
  // What crosses the isolation boundary is TRANSPILED — the sandbox has no
  // compiler. That the JSX became `React.createElement` here is the proof that
  // sucrase came through the package's own manifest.
  assert(
    sandbox.runs[0].code.includes('createElement'),
    `the submitted source was not transpiled: ${sandbox.runs[0].code.slice(0, 80)}`,
  );
  assert(
    sandbox.runs[0].checks.map((c) => c.id).join() === 'texto,cor',
    'the authored check list did not ride along with the submit',
  );

  sandbox.answer([{ id: 'texto', passed: false }, { id: 'cor', passed: false }]);
  const items = view.all('[data-testid="code-check-item"]');
  assert(items.length === 2, `expected 2 verdict lines, got ${items.length}`);
  assert(items.every((el) => el.getAttribute('data-passed') === 'false'), 'a check passed by accident');
  // The hint shows only where it failed, and only after the submit.
  assert(view.text().includes('Troque o rótulo'), 'the authored hint never reached the screen');
  assert(completions.length === 0, 'a failed submit settled the activity on its own');

  // "Tentar de novo" walks back to editing with the work intact.
  view.click(view.one('[data-testid="code-checks-retry"]'));
  assert(!view.one('[data-testid="code-checks-feedback"]'), 'the verdict survived a retry');
  const editor = view.one('[data-testid="code-editor"]');
  assert(!editor.readOnly, 'the editor stayed frozen after a retry');

  setValue(editor, 'export default () => <button className="bg-emerald-500">Gostei</button>;');
  view.click(view.one('[data-testid="code-submit"]'));
  assert(sandbox.runs.length === 2, 'the second submit never reached the sandbox');
  assert(
    sandbox.runs[1].token > sandbox.runs[0].token,
    'the run token did not advance — a late answer could overwrite a newer verdict',
  );
  sandbox.answer([{ id: 'texto', passed: true }, { id: 'cor', passed: true }]);
  assert(
    view.one('[data-testid="code-checks-feedback"]')?.getAttribute('data-all-passed') === 'true',
    'a fully passing run was not reported as passing',
  );

  // No acerto não há segundo clique: o submit já reporta (Tainan, 17/08/2026).
  assert(!view.one('[data-testid="code-checks-continue"]'), 'a pass still asked for a second click');
  assert(completions.length === 1, `onComplete fired ${completions.length} times, expected 1`);
  assert(completions[0].correct === true, 'the passing run was graded wrong');
  assert(
    completions[0].detail?.response?.includes('bg-emerald-500'),
    'the learner SOURCE did not ride up with the verdict',
  );
  assert(
    events.some((e) => e.type === 'activity.completed' && e.payload?.correct === true),
    'the host was not told the snack settled',
  );
  view.unmount();
});

check('a stuck learner is never trapped — "seguir mesmo assim" records the REAL result', () => {
  const { view, completions } = renderCode();
  const sandbox = previewSandbox(view);
  sandbox.boot();
  view.click(view.one('[data-testid="code-submit"]'));
  sandbox.answer([{ id: 'texto', passed: false }, { id: 'cor', passed: true }]);
  view.click(view.one('[data-testid="code-checks-continue"]'));
  assert(completions[0]?.correct === false, 'moving on after failing was recorded as a pass');
  view.unmount();
});

check('the draft port: the kind READS through it, under the documented key', () => {
  const key = codeDraftKey('fixture-code');
  assert(key === `${CODE_DRAFT_KEY_PREFIX}fixture-code`, `unexpected draft key: ${key}`);
  const store = new Map([[key, 'const trabalho = "de ontem";']]);
  const storage = {
    read: (k) => store.get(k) ?? null,
    write: (k, v) => store.set(k, v),
    clear: (k) => store.delete(k),
  };
  const { view } = renderCode({ storage });
  // On the FIRST paint, not after an effect: a flash of the starter reads as
  // "my code is gone" even when it comes back a frame later.
  assert(
    view.one('[data-testid="code-editor"]').value === 'const trabalho = "de ontem";',
    'the saved draft was not restored — the host storage port is not being read',
  );

  // …and "recomeçar" really drops it, through the same port.
  view.click(view.one('[data-testid="code-reset"]'));
  view.click(view.one('[data-testid="code-reset-confirm"]'));
  assert(!store.has(key), 'recomeçar left the discarded draft on the host store');
  view.unmount();
});

await checkAsync('the draft port: the kind WRITES through it, debounced', async () => {
  const store = new Map();
  const storage = {
    read: (k) => store.get(k) ?? null,
    write: (k, v) => store.set(k, v),
    clear: (k) => store.delete(k),
  };
  const { view } = renderCode({ storage });
  setValue(view.one('[data-testid="code-editor"]'), 'const meu = "trabalho";');
  assert(store.size === 0, 'the autosave fired without waiting for the debounce');

  // Real time, not fake: this harness has no timer control, and 600ms of wall
  // clock is the honest price of asserting a debounce from outside.
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert(
    store.get(codeDraftKey('fixture-code')) === 'const meu = "trabalho";',
    `nothing was written under the documented key: ${[...store.keys()].join(', ') || '(empty)'}`,
  );
  view.unmount();
});

check('the code kind touched the network ZERO times either', () => {
  assert(
    networkAttempts.length === 0,
    `the package attempted ${networkAttempts.length}: ${networkAttempts.join('; ')}`,
  );
});

/* ═════════════════════════════════ verdict ════════════════════════════════ */

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`\nEXTERNAL CONSUMER CHECK FAILED — ${failures} failing`);
  process.exit(1);
}
console.log('EXTERNAL CONSUMER CHECK PASSED');
