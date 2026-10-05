import { describe, expect, it } from 'vitest';
import {
  BLOCKED_NOTICE,
  INITIAL_CHROME,
  LOAD_TIMEOUT_MS,
  MAX_PROCESS_DEATHS,
  VEIL_FADE_MS,
  blockedNotice,
  cardCopy,
  chromeReducer,
  classifyLoadError,
  isCardVisible,
  isVeilVisible,
  noticeDue,
  NOTICE_GAP_MS,
  restartUrl,
  shouldHandleBack,
  type ChromeEvent,
  type ChromeState,
} from './shellChromeState';

const run = (events: ChromeEvent[], from: ChromeState = INITIAL_CHROME) => events.reduce(chromeReducer, from);
const O = 'https://app.iterahq.dev';

describe('loading veil', () => {
  it('starts with the veil up and no card', () => {
    expect(isVeilVisible(INITIAL_CHROME)).toBe(true);
    expect(isCardVisible(INITIAL_CHROME)).toBe(false);
  });
  it('a finished load lowers the veil', () => {
    const s = run([{ type: 'loadStart' }, { type: 'loadEnd' }]);
    expect(s.phase).toBe('ready');
    expect(isVeilVisible(s)).toBe(false);
  });
  it('a later full-page navigation raises the veil again with a new load id', () => {
    const ready = run([{ type: 'loadEnd' }]);
    const s = run([{ type: 'loadStart' }], ready);
    expect(s.phase).toBe('loading');
    expect(s.loadId).toBe(ready.loadId + 1);
  });
  it('a second loadStart during a load does not restart the 15 s timer', () => {
    expect(run([{ type: 'loadStart' }, { type: 'loadStart' }]).loadId).toBe(INITIAL_CHROME.loadId);
  });
  it('uses the timings of section 4.1', () => {
    expect(LOAD_TIMEOUT_MS).toBe(15_000);
    expect(VEIL_FADE_MS).toBe(150);
  });
});

describe('15 s timeout', () => {
  it('shows the failure card when the load never finishes', () => {
    const s = run([{ type: 'timeout', loadId: INITIAL_CHROME.loadId }]);
    expect(s.phase).toBe('failed');
    expect(s.failure).toBe('timeout');
  });
  it('a timeout of an earlier load changes nothing', () => {
    const second = run([{ type: 'loadEnd' }, { type: 'loadStart' }]);
    expect(run([{ type: 'timeout', loadId: INITIAL_CHROME.loadId }], second)).toBe(second);
  });
  it('a timeout after the load finished changes nothing', () => {
    const ready = run([{ type: 'loadEnd' }]);
    expect(run([{ type: 'timeout', loadId: ready.loadId }], ready)).toBe(ready);
  });
});

describe('load failure card', () => {
  it('onError shows the generic card', () => {
    const s = run([{ type: 'loadStart' }, { type: 'error', description: 'net::ERR_CONNECTION_REFUSED' }]);
    expect(isCardVisible(s)).toBe(true);
    expect(s.failure).toBe('load');
    expect(cardCopy(s.failure).title).toBe('Não foi possível abrir a Itera');
  });
  it.each(['net::ERR_INTERNET_DISCONNECTED', 'The Internet connection appears to be offline.', 'You are not connected to the internet'])(
    'onError "%s" shows the "Sem conexão" card',
    (description) => {
      const s = run([{ type: 'error', description }]);
      expect(s.failure).toBe('offline');
      expect(cardCopy(s.failure).title).toBe('Sem conexão');
    },
  );
  it.each(['net::ERR_NAME_NOT_RESOLVED', 'net::ERR_SSL_PROTOCOL_ERROR', ''])('classifies "%s" as a plain load failure', (description) => {
    expect(classifyLoadError(description)).toBe('load');
  });
  it.each([400, 403, 404, 500, 503])('a page answering %i shows the card, with no URL comparison', (statusCode) => {
    const s = run([{ type: 'loadStart' }, { type: 'httpError', statusCode }]);
    expect(s.phase).toBe('failed');
    expect(s.failure).toBe('http');
  });
  it.each([200, 301, 304, 399])('a status of %i is not an error', (statusCode) => {
    expect(run([{ type: 'httpError', statusCode }]).phase).toBe('loading');
  });
  it('the finish event that follows a failure keeps the card up', () => {
    const s = run([{ type: 'httpError', statusCode: 503 }, { type: 'loadEnd' }]);
    expect(s.phase).toBe('failed');
    expect(run([{ type: 'error', description: 'x' }, { type: 'loadEnd' }]).phase).toBe('failed');
  });
  it('a load that finishes after the 15 s timeout lowers the card', () => {
    const s = run([{ type: 'timeout', loadId: INITIAL_CHROME.loadId }, { type: 'loadEnd' }]);
    expect(s.phase).toBe('ready');
    expect(s.failure).toBeNull();
  });
  it('an error after a timeout still keeps the card up after the finish event', () => {
    const s = run([{ type: 'timeout', loadId: 0 }, { type: 'error', description: 'x' }, { type: 'loadEnd' }]);
    expect(s.phase).toBe('failed');
  });
  it('an error while a page is showing raises the card', () => {
    expect(run([{ type: 'loadEnd' }, { type: 'httpError', statusCode: 500 }]).phase).toBe('failed');
  });
  it('a new navigation (back) from the card goes back to the veil', () => {
    const s = run([{ type: 'error', description: 'x' }, { type: 'loadStart' }]);
    expect(s.phase).toBe('loading');
    expect(s.failure).toBeNull();
  });
});

describe('retry', () => {
  it('re-creates the WebView and raises the veil', () => {
    const card = run([{ type: 'httpError', statusCode: 503 }]);
    const s = run([{ type: 'retry' }], card);
    expect(s.phase).toBe('loading');
    expect(s.failure).toBeNull();
    expect(s.mountKey).toBe(card.mountKey + 1);
    expect(s.loadId).toBe(card.loadId + 1);
  });
  it('does nothing when there is no card', () => {
    const ready = run([{ type: 'loadEnd' }]);
    expect(run([{ type: 'retry' }], ready)).toBe(ready);
  });
  it('a retry that fails again shows the card again', () => {
    const s = run([{ type: 'error', description: 'x' }, { type: 'retry' }, { type: 'error', description: 'x' }]);
    expect(isCardVisible(s)).toBe(true);
  });
  it('a timeout of the failed attempt cannot fail the retry', () => {
    const failedTimeout = run([{ type: 'timeout', loadId: 0 }]);
    const retried = run([{ type: 'retry' }], failedTimeout);
    expect(run([{ type: 'timeout', loadId: failedTimeout.loadId }], retried).phase).toBe('loading');
  });
});

describe('process death (ADR-6, ADR-10)', () => {
  it('re-creates the WebView under the veil', () => {
    const ready = run([{ type: 'loadEnd' }]);
    const s = run([{ type: 'processGone' }], ready);
    expect(s.phase).toBe('loading');
    expect(s.mountKey).toBe(ready.mountKey + 1);
  });
  it('a finished load between deaths resets the count', () => {
    let s = INITIAL_CHROME;
    for (let i = 0; i < 10; i++) s = run([{ type: 'processGone' }, { type: 'loadEnd' }], s);
    expect(s.phase).toBe('ready');
  });
  it(`${MAX_PROCESS_DEATHS} deaths in a row stop the reload loop and show the card`, () => {
    const s = run(Array.from({ length: MAX_PROCESS_DEATHS }, () => ({ type: 'processGone' }) as const));
    expect(s.phase).toBe('failed');
    expect(s.failure).toBe('process');
  });
  it('Retry after that card starts over with a clean count', () => {
    const dead = run(Array.from({ length: MAX_PROCESS_DEATHS }, () => ({ type: 'processGone' }) as const));
    const s = run([{ type: 'retry' }, { type: 'processGone' }], dead);
    expect(s.phase).toBe('loading');
  });
});

describe('restartUrl', () => {
  const entry = `${O}/catalog`;
  it('keeps the page the learner was on', () => {
    expect(restartUrl(`${O}/lesson/9`, O, entry)).toBe(`${O}/lesson/9`);
  });
  it.each(['about:blank', 'https://evil.example/', `${O}.evil.example/`, 'not a url', ''])('falls back to the entry URL for %s', (url) => {
    expect(restartUrl(url, O, entry)).toBe(entry);
  });
});

describe('blocked-navigation notice', () => {
  it('a blocked top-frame navigation shows "Indisponível no app"', () => {
    expect(blockedNotice('block', true)).toBe(BLOCKED_NOTICE);
    expect(BLOCKED_NOTICE).toBe('Indisponível no app');
  });
  it.each([
    ['block', false],
    ['load', true],
    ['external', true],
  ] as const)('%s, top frame %s: no notice', (decision, top) => {
    expect(blockedNotice(decision, top)).toBeNull();
  });
});

describe('hardware back', () => {
  it.each([
    [true, 'ready', true],
    [true, 'loading', true],
    [false, 'ready', false],
    [false, 'loading', false],
    [true, 'failed', false],
    [false, 'failed', false],
  ] as const)('canGoBack %s, phase %s -> handled %s', (canGoBack, phase, want) => {
    expect(shouldHandleBack(canGoBack, phase)).toBe(want);
  });
});

describe('noticeDue', () => {
  it('the first notice is due; the next one waits NOTICE_GAP_MS', () => {
    expect(noticeDue(null, 1000)).toBe(true);
    expect(noticeDue(1000, 1000 + NOTICE_GAP_MS - 1)).toBe(false);
    expect(noticeDue(1000, 1000 + NOTICE_GAP_MS)).toBe(true);
  });
});

describe('start URL of a re-created WebView', () => {
  const A = 'https://app.iterahq.dev/lesson/a';
  const B = 'https://app.iterahq.dev/lesson/b';

  it('starts on the entry URL', () => {
    expect(INITIAL_CHROME.startUrl).toBeNull();
  });
  it('a retry and a process death start the new WebView on the URL they carry', () => {
    const card = run([{ type: 'error', description: 'x' }]);
    expect(run([{ type: 'retry', url: A }], card).startUrl).toBe(A);
    expect(run([{ type: 'processGone', url: B }]).startUrl).toBe(B);
  });
  it('the start URL changes only together with the mount key', () => {
    const ready = run([{ type: 'processGone', url: A }, { type: 'loadEnd' }]);
    const ignored = run([{ type: 'retry', url: B }], ready);
    expect(ignored.mountKey).toBe(ready.mountKey);
    expect(ignored.startUrl).toBe(A);
  });
  it('the death that shows the card keeps the mounted WebView on its URL: no new source, so no load under the card', () => {
    const twice = run([{ type: 'processGone', url: A }, { type: 'processGone', url: A }]);
    const dead = run([{ type: 'processGone', url: B }], twice);
    expect(dead.failure).toBe('process');
    expect(dead.mountKey).toBe(twice.mountKey);
    expect(dead.startUrl).toBe(A);
  });
  it('an event with no URL keeps the one before it', () => {
    expect(run([{ type: 'processGone', url: A }, { type: 'processGone' }]).startUrl).toBe(A);
  });
});
