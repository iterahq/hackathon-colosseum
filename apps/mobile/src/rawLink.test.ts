import { describe, expect, it } from 'vitest';
import { isCallbackEntry } from './deepLink';
import { forgetLink, lastLink, rememberLink } from './rawLink';

describe('rawLink', () => {
  it('keeps the last link only, as given', () => {
    expect(lastLink()).toBeNull();
    rememberLink('https://app.iterahq.dev/a?x=%252F#y');
    rememberLink('https://app.iterahq.dev/b?x=%252F#z');
    expect(lastLink()).toBe('https://app.iterahq.dev/b?x=%252F#z');
  });

  it('forgets the link the route consumed for the callback path, and keeps any other until the next link', () => {
    const consume = (entry: string) => {
      if (isCallbackEntry(entry)) forgetLink();
    };
    rememberLink('https://app.iterahq.dev/auth/dfl/callback#dfl_token=a.b.c');
    consume('/auth/dfl/callback#dfl_token=a.b.c');
    expect(lastLink()).toBeNull();
    rememberLink('https://app.iterahq.dev/lesson/x?y=1');
    consume('/lesson/x?y=1');
    expect(lastLink()).toBe('https://app.iterahq.dev/lesson/x?y=1');
  });

  it('forgets', () => {
    rememberLink('https://app.iterahq.dev/a');
    forgetLink();
    expect(lastLink()).toBeNull();
  });
});
