import { beforeEach, describe, expect, it } from 'vitest';
import { redirectSystemPath } from '../app/+native-intent';
import { entryFromLink } from './deepLink';
import { forgetLink, lastLink, rememberLink } from './rawLink';

// This file lives in `src/`, not next to `app/+native-intent.ts`: Expo Router builds its route context from EVERY `.ts`/`.tsx` file under
// `app/` except `+api`, `+html` and `+middleware` (`expo-router/_ctx.android.js`), so a `.test.ts` there would be bundled as a route and pull Vitest into the app.
const APP = 'https://app.iterahq.dev';
const through = (path: string, initial = false) => redirectSystemPath({ path, initial });

beforeEach(() => forgetLink());

describe('redirectSystemPath + rawLink', () => {
  it('remembers a link as it arrived and returns it unchanged', () => {
    const raw = `${APP}/auth/dfl/callback?next=%252Fprogram#dfl_token=a.b.c`;
    expect(through(raw)).toBe(raw);
    expect(lastLink()).toBe(raw);
  });

  it('remembers on a cold start (initial) and on a warm one alike', () => {
    expect(through(`${APP}/lesson/x?y=1`, true)).toBe(`${APP}/lesson/x?y=1`);
    expect(lastLink()).toBe(`${APP}/lesson/x?y=1`);
    through(`${APP}/profile`, false);
    expect(lastLink()).toBe(`${APP}/profile`);
  });

  it('the next link replaces the last one', () => {
    through(`${APP}/a?x=1`);
    through(`${APP}/b?x=2`);
    expect(lastLink()).toBe(`${APP}/b?x=2`);
  });

  it.each([
    [`${APP}/auth/reset#access_token=at&refresh_token=rt&type=recovery`, `${APP}/auth/reset`],
    [`${APP}/#access_token=at&refresh_token=rt`, `${APP}/`],
    [`${APP}/?refresh_token=rt`, `${APP}/`],
    [`${APP}/home?x=1#a=b&REFRESH_TOKEN=rt`, `${APP}/home`],
    [`${APP}/home#refresh%5Ftoken=rt`, `${APP}/home`],
    [`${APP}/home?next=refresh_token%3Drt`, `${APP}/home`],
  ])('strips query and fragment of %s: neither the router nor rawLink holds the token', (raw, stripped) => {
    expect(through(raw)).toBe(stripped);
    expect(lastLink()).toBe(stripped);
    expect(`${through(raw)}${lastLink()}`).not.toMatch(/refresh|rt\b/i);
  });

  it('a link with a refresh token in its path is not remembered and goes to the root', () => {
    rememberLink(`${APP}/older`);
    expect(through(`${APP}/refresh_token/x`)).toBe('/');
    expect(lastLink()).toBeNull();
  });

  it('forgets a link kept earlier when the new one cannot be read', () => {
    through(`${APP}/older?x=1`);
    expect(through(undefined as unknown as string)).toBe('/');
    expect(lastLink()).toBeNull();
  });

  it('the stripped link opens the page on its path alone (entryFromLink)', () => {
    through(`${APP}/auth/reset#access_token=at&refresh_token=rt`);
    expect(entryFromLink(lastLink(), APP, ['auth', 'reset'], {})).toBe('/auth/reset');
  });

  it('the kept link feeds entryFromLink byte for byte', () => {
    through(`${APP}/auth/dfl/callback?next=%252Fprogram#dfl_token=a.b.c`);
    expect(entryFromLink(lastLink(), APP, ['auth', 'dfl', 'callback'], { next: '%2Fprogram' })).toBe('/auth/dfl/callback?next=%252Fprogram#dfl_token=a.b.c');
  });

  it('forgetting (the route took the callback as its entry) leaves nothing', () => {
    through(`${APP}/auth/dfl/callback#dfl_token=a.b.c`);
    forgetLink();
    expect(lastLink()).toBeNull();
  });

  it.each([undefined, null, 7, {}, [], '', '#', '?', '%', '\u0000', '😀'.repeat(10), 'x'.repeat(100_000)])('garbage %#: never throws and returns a string', (garbage) => {
    expect(() => through(garbage as string)).not.toThrow();
    expect(typeof through(garbage as string)).toBe('string');
  });

  it('garbage that spells refresh_token still never leaves it in the returned path or in memory', () => {
    for (const garbage of ['refresh_token', 'REFRESH%5FTOKEN=x', '%refresh_token', `${APP}/x/refresh%255Ftoken`]) {
      const out = through(garbage);
      expect(out).not.toMatch(/refresh(?:_|%5f|%255f)token/i);
      expect(lastLink() ?? '').not.toMatch(/refresh(?:_|%5f|%255f)token/i);
    }
  });
});
