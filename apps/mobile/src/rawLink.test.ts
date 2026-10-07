import { describe, expect, it } from 'vitest';
import { forgetLink, lastLink, rememberLink } from './rawLink';

describe('rawLink', () => {
  it('keeps the last link only, as given', () => {
    expect(lastLink()).toBeNull();
    rememberLink('https://app.iterahq.dev/a?x=%252F#y');
    rememberLink('https://app.iterahq.dev/b?x=%252F#z');
    expect(lastLink()).toBe('https://app.iterahq.dev/b?x=%252F#z');
  });

  it('forgets', () => {
    rememberLink('https://app.iterahq.dev/a');
    forgetLink();
    expect(lastLink()).toBeNull();
  });
});
