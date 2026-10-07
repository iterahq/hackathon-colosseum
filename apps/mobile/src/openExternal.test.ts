import { describe, expect, it, vi } from 'vitest';
import { CHROME_COPY } from './chromeCopy';
import { browserMethod, createOpenReporter } from './openExternal';
import { NOTICE_GAP_MS } from './shellChromeState';

const OPEN_FAILED_NOTICE = CHROME_COPY.pt.openFailed;
const AUTH_FAILED_NOTICE = CHROME_COPY.pt.authFailed;

describe('browserMethod', () => {
  it('Android opens a Custom Tab, because the app itself handles its https links there', () => {
    expect(browserMethod('android')).toBe('custom-tab');
  });
  it.each(['ios', 'web', ''])('%s keeps Linking.openURL', (os) => {
    expect(browserMethod(os)).toBe('linking');
  });
});

describe('createOpenReporter', () => {
  const setup = () => {
    let t = 10_000;
    const show = vi.fn();
    return { show, advance: (ms: number) => (t += ms), reporter: createOpenReporter(show, () => t, OPEN_FAILED_NOTICE) };
  };

  it('says nothing when the open works', async () => {
    const { reporter, show } = setup();
    await reporter.attempt(() => Promise.resolve(true));
    expect(show).not.toHaveBeenCalled();
  });

  it('shows one short notice, never the URL or the error text, when the open rejects', async () => {
    const { reporter, show } = setup();
    await reporter.attempt(() => Promise.reject(new Error('Unable to open URL: https://secret.example/?token=abc')));
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith(OPEN_FAILED_NOTICE);
  });

  it('a synchronous throw is a failure too, and attempt never rejects', async () => {
    const { reporter, show } = setup();
    await expect(
      reporter.attempt(() => {
        throw new Error('boom');
      }),
    ).resolves.toBeUndefined();
    expect(show).toHaveBeenCalledWith(OPEN_FAILED_NOTICE);
  });

  it('names the notice the caller asks for', async () => {
    const { reporter, show } = setup();
    await reporter.attempt(() => Promise.reject(new Error('x')), AUTH_FAILED_NOTICE);
    expect(show).toHaveBeenCalledWith(AUTH_FAILED_NOTICE);
  });

  it('at most one notice per NOTICE_GAP_MS, the rate of the blocked-navigation notice', async () => {
    const { reporter, show, advance } = setup();
    const fails = () => Promise.reject(new Error('x'));
    await reporter.attempt(fails);
    reporter.fail();
    advance(NOTICE_GAP_MS - 1);
    await reporter.attempt(fails);
    expect(show).toHaveBeenCalledTimes(1);
    advance(1);
    reporter.fail();
    expect(show).toHaveBeenCalledTimes(2);
  });

  it('the copy is short, in both languages, with no URL', () => {
    for (const text of [OPEN_FAILED_NOTICE, AUTH_FAILED_NOTICE, CHROME_COPY.en.openFailed, CHROME_COPY.en.authFailed]) {
      expect(text.length).toBeLessThan(40);
      expect(text).not.toMatch(/https?:|\//);
    }
  });
});
