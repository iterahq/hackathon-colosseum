import { ENVELOPE_TAG } from '@iterahq/shell-bridge';
import { describe, expect, it, vi } from 'vitest';
import * as consoleMessage from './consoleMessage';
import { MAX_MESSAGES_PER_SECOND, MAX_RAW_CHARS_PER_SECOND, MAX_RAW_MESSAGES_PER_SECOND, type MessageBucket, type RawBucket } from './messageWindow';
import { receiveShellMessage, type ShellMessageAnswer } from './receiveShellMessage';

const O = 'https://app.iterahq.dev';
const PAGE = `${O}/lesson/1`;
const wire = (level: string, text: string) => JSON.stringify({ type: 'console', level, text });
const hello = JSON.stringify({ tag: ENVELOPE_TAG, v: 1, kind: 'hello', id: 'wAAAAAAAA1', payload: { webVersion: 't', protocols: [1] } });
const EMPTY_RAW: RawBucket = { start: 0, count: 0, chars: 0 };
const EMPTY_PAGE: MessageBucket = { start: 0, count: 0 };

type Event = { data: unknown; url: unknown };
function receive(event: Event, over: { raw?: RawBucket; page?: MessageBucket; dev?: boolean; now?: number; platform?: string } = {}): ShellMessageAnswer {
  return receiveShellMessage({ event, raw: over.raw ?? EMPTY_RAW, page: over.page ?? EMPTY_PAGE, origin: O, platform: over.platform ?? 'ios', dev: over.dev ?? true, now: over.now ?? 5000 });
}

/** The tests that must see no JSON at all spy on it. */
const spyParse = () => vi.spyOn(JSON, 'parse');

describe('receiveShellMessage', () => {
  it('a frame on another origin stops at the gate: nothing parsed, nothing counted', () => {
    const parse = spyParse();
    for (const url of ['about:srcdoc', 'null', 'https://evil.example/', 'blob:https://app.iterahq.dev/1', null, 7]) {
      expect(receive({ data: wire('error', 'x'), url })).toEqual({ kind: 'drop', raw: EMPTY_RAW, page: EMPTY_PAGE });
    }
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it('a non-string payload from the app origin stops at the gate', () => {
    expect(receive({ data: { type: 'console' }, url: PAGE })).toEqual({ kind: 'drop', raw: EMPTY_RAW, page: EMPTY_PAGE });
  });

  it('an app origin that is not http(s) drops everything', () => {
    const answer = receiveShellMessage({ event: { data: hello, url: 'about:blank' }, raw: EMPTY_RAW, page: EMPTY_PAGE, origin: 'about:blank', platform: 'ios', dev: true, now: 5000 });
    expect(answer.kind).toBe('drop');
  });

  it('an oversize message passes the gate, is counted raw, and is dropped by the parsers without charging the page', () => {
    const answer = receive({ data: 'x'.repeat(100_000), url: PAGE });
    expect(answer).toEqual({ kind: 'drop', raw: { start: 5000, count: 1, chars: 100_000 }, page: EMPTY_PAGE });
  });

  it('a message past the raw character limit is dropped before any parse', () => {
    const parse = spyParse();
    const raw: RawBucket = { start: 5000, count: 1, chars: MAX_RAW_CHARS_PER_SECOND - 5 };
    const answer = receive({ data: wire('error', 'too many chars'), url: PAGE }, { raw });
    expect(answer).toEqual({ kind: 'drop', raw, page: EMPTY_PAGE });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it('a message past the raw count limit is dropped before any parse, and opens again a second later', () => {
    const parse = spyParse();
    const raw: RawBucket = { start: 5000, count: MAX_RAW_MESSAGES_PER_SECOND, chars: 10 };
    expect(receive({ data: hello, url: PAGE }, { raw }).kind).toBe('drop');
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
    expect(receive({ data: hello, url: PAGE }, { raw, now: 6000 }).kind).toBe('bridge');
  });

  it('the console shape in development is a console answer, redacted, with both buckets advanced', () => {
    const answer = receive({ data: wire('error', 'failed ?code=9f8e'), url: PAGE });
    expect(answer).toEqual({
      kind: 'console',
      message: { type: 'console', level: 'error', text: 'failed ?code=[redacted]' },
      raw: { start: 5000, count: 1, chars: wire('error', 'failed ?code=9f8e').length },
      page: { start: 5000, count: 1 },
    });
  });

  it('in production the console shape is NOT read: the parser is not called and the page is not charged', () => {
    const read = vi.spyOn(consoleMessage, 'readConsoleShape');
    receive({ data: wire('error', 'x'), url: PAGE }, { dev: true });
    expect(read).toHaveBeenCalledTimes(1);
    read.mockClear();
    const answer = receive({ data: wire('error', 'x'), url: PAGE }, { dev: false });
    expect(read).not.toHaveBeenCalled();
    expect(answer.kind).toBe('drop');
    expect(answer.page).toEqual(EMPTY_PAGE);
    read.mockRestore();
  });

  it('a bridge envelope is a bridge answer carrying the sender, attributed on iOS', () => {
    const answer = receive({ data: hello, url: PAGE });
    expect(answer).toMatchObject({ kind: 'bridge', message: { raw: hello, senderUrl: PAGE, kind: 'hello', attributed: true }, page: { start: 5000, count: 1 } });
  });

  it('the platform reaches the bridge parser: Android with a path is not attributed', () => {
    const answer = receive({ data: hello, url: PAGE }, { platform: 'android' });
    expect(answer).toMatchObject({ kind: 'bridge', message: { attributed: false } });
  });

  it('a bridge envelope is read in production too', () => {
    expect(receive({ data: hello, url: PAGE }, { dev: false }).kind).toBe('bridge');
  });

  it('a message neither parser accepts is dropped, the raw budget is charged and the page budget is not', () => {
    const answer = receive({ data: '{"not":"ours"}', url: PAGE });
    expect(answer).toEqual({ kind: 'drop', raw: { start: 5000, count: 1, chars: 14 }, page: EMPTY_PAGE });
  });

  it('the page budget exhausted drops what a parser accepted, and keeps the exhausted bucket', () => {
    const page: MessageBucket = { start: 5000, count: MAX_MESSAGES_PER_SECOND };
    const answer = receive({ data: wire('error', 'x'), url: PAGE }, { page });
    expect(answer.kind).toBe('drop');
    expect(answer.page).toEqual(page);
    expect(receive({ data: wire('error', 'x'), url: PAGE }, { page, now: 6000 }).kind).toBe('console');
  });

  it('does not change the buckets it is given', () => {
    const raw = { ...EMPTY_RAW };
    const page = { ...EMPTY_PAGE };
    receive({ data: hello, url: PAGE }, { raw, page });
    expect(raw).toEqual(EMPTY_RAW);
    expect(page).toEqual(EMPTY_PAGE);
  });
});

describe('receiveShellMessage over a stream (the shell as the route runs it)', () => {
  function shell(dev = true) {
    let raw = EMPTY_RAW;
    let page = EMPTY_PAGE;
    const handled: string[] = [];
    return {
      handled,
      receive(event: Event, now: number) {
        const answer = receiveShellMessage({ event, raw, page, origin: O, platform: 'ios', dev, now });
        raw = answer.raw;
        page = answer.page;
        if (answer.kind === 'console') handled.push(answer.message.text);
      },
    };
  }

  it('starvation is impossible where the frame is known: a sandboxed frame posting in a loop costs the page nothing', () => {
    const s = shell();
    const parse = spyParse();
    for (let i = 0; i < 100_000; i++) s.receive({ data: wire('error', 'flood'), url: i % 2 ? 'about:srcdoc' : 'null' }, 5000);
    expect(parse).not.toHaveBeenCalled();
    s.receive({ data: wire('error', 'the page'), url: PAGE }, 5000);
    expect(s.handled).toEqual(['the page']);
    parse.mockRestore();
  });

  it('garbage from the app origin does not use up the page budget', () => {
    const s = shell();
    for (let i = 0; i < MAX_RAW_MESSAGES_PER_SECOND - 1; i++) s.receive({ data: '{"not":"ours"}', url: PAGE }, 5000);
    s.receive({ data: wire('error', 'the page'), url: PAGE }, 5000);
    expect(s.handled).toEqual(['the page']);
  });

  it('the parse flood is bounded where every frame looks like the page (Android legacy): 100 000 messages, at most the raw limit is parsed', () => {
    const s = shell();
    const parse = spyParse();
    const big = wire('error', 'x'.repeat(3000));
    for (let i = 0; i < 100_000; i++) s.receive({ data: big, url: PAGE }, 5000 + (i % 900));
    expect(parse.mock.calls.length).toBeLessThanOrEqual(MAX_RAW_MESSAGES_PER_SECOND);
    expect(parse.mock.calls.reduce((n, [text]) => n + String(text).length, 0)).toBeLessThanOrEqual(MAX_RAW_CHARS_PER_SECOND);
    expect(s.handled.length).toBe(MAX_MESSAGES_PER_SECOND);
    parse.mockRestore();
  });
});
