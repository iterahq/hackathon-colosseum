import { describe, expect, it, vi } from 'vitest';
import {
  MAX_MESSAGES_PER_SECOND,
  MAX_RAW_CHARS_PER_SECOND,
  MAX_RAW_MESSAGES_PER_SECOND,
  admitMessage,
  admitRaw,
  messageSize,
  type MessageBucket,
  type RawBucket,
} from './messageWindow';

const O = 'https://app.iterahq.dev';
const PAGE = `${O}/lesson/1`;

describe('admitMessage (native-side limit)', () => {
  it(`admits ${MAX_MESSAGES_PER_SECOND} messages in a second and drops the rest`, () => {
    let w = { start: 0, count: 0 };
    let admitted = 0;
    for (let i = 0; i < 50; i++) {
      const r = admitMessage(w, 5000 + i);
      w = r.bucket;
      if (r.admitted) admitted += 1;
    }
    expect(admitted).toBe(MAX_MESSAGES_PER_SECOND);
  });
  it('admits again once a second has passed', () => {
    let w = { start: 0, count: 0 };
    for (let i = 0; i < 20; i++) w = admitMessage(w, 5000).bucket;
    expect(admitMessage(w, 5000).admitted).toBe(false);
    expect(admitMessage(w, 6000).admitted).toBe(true);
  });
  it('does not change the bucket it is given', () => {
    const w: MessageBucket = { start: 5000, count: 3 };
    admitMessage(w, 5001);
    expect(w).toEqual({ start: 5000, count: 3 });
  });
});

describe('messageSize', () => {
  it('is the length of a string from a frame on the app origin, and null for anything else, with no parse', () => {
    const parse = vi.spyOn(JSON, 'parse');
    expect(messageSize({ data: 'x'.repeat(300), url: PAGE }, O)).toBe(300);
    expect(messageSize({ data: '{"a":1}', url: O }, O)).toBe(7);
    for (const url of ['about:srcdoc', 'null', 'https://evil.example/', 'blob:https://app.iterahq.dev/1', null, 7]) {
      expect(messageSize({ data: '{"a":1}', url }, O)).toBeNull();
    }
    expect(messageSize({ data: { a: 1 }, url: PAGE }, O)).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });
});

describe('admitRaw (the raw limit in front of the parsers, R-12)', () => {
  it('admits a count and a length per second, refuses beyond either, and opens again a second later', () => {
    let bucket: RawBucket = { start: 0, count: 0, chars: 0 };
    let admitted = 0;
    for (let i = 0; i < 500; i++) {
      const r = admitRaw(bucket, 5000 + i, 10);
      bucket = r.bucket;
      if (r.admitted) admitted += 1;
    }
    expect(admitted).toBe(MAX_RAW_MESSAGES_PER_SECOND);
    expect(admitRaw(bucket, 6000, 10).admitted).toBe(true);

    let big: RawBucket = { start: 0, count: 0, chars: 0 };
    let chars = 0;
    for (let i = 0; i < 30; i++) {
      const r = admitRaw(big, 9000, 64 * 1024);
      big = r.bucket;
      if (r.admitted) chars += 64 * 1024;
    }
    expect(chars).toBe(MAX_RAW_CHARS_PER_SECOND);
    expect(admitRaw(big, 9000, 1).admitted).toBe(false);
  });

  it('returns the next bucket and leaves the one it is given alone', () => {
    const bucket: RawBucket = { start: 0, count: 0, chars: 0 };
    const next = admitRaw(bucket, 5000, 12).bucket;
    expect(next).toEqual({ start: 5000, count: 1, chars: 12 });
    expect(bucket).toEqual({ start: 0, count: 0, chars: 0 });
  });
});
