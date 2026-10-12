import { afterEach, describe, expect, it, vi } from 'vitest';
import { resources } from '@/i18n';
import { formatPageTitle, pageName, pageTitleKey } from './pageTitle';

afterEach(() => pageName.set(null));

describe('pageTitleKey', () => {
  it.each([
    ['/login', 'auth.login'],
    ['/signup', 'auth.signUp'],
    ['/auth/forgot', 'auth.forgot.title'],
    ['/auth/reset', 'auth.reset.title'],
    ['/auth/code', 'auth.otp.title'],
    ['/', 'nav.discover'],
    ['/catalog', 'catalog.title'],
    ['/catalog/', 'catalog.title'],
    ['/artifacts', 'artifacts.title'],
    ['/profile', 'profile.title'],
    ['/passport', 'passport.title'],
    ['/certifications', 'passport.title'],
    ['/c/4Gghfa7Hq2Z6hetdDizmd3VGSw3MjNueMG35UnR2ZBXx', 'passport.credential.title'],
    ['/u/CuVeEAWzJhEqibA8TG74fSzPyr73bS7xB7sDJ5GZtmVB', 'passport.publicProfile.title'],
    ['/subscribe', 'subscribe.title'],
  ])('%s is named by %s, a string both locales have', (pathname, key) => {
    expect(pageTitleKey(pathname)).toBe(key);
    expect(resources.pt[key]).toBeTruthy();
    expect(resources.en[key]).toBeTruthy();
  });

  it.each(['/program/itera-v2', '/lesson/abc', '/subscribe/return', '/auth/dfl/callback', '/live/123', '/catalogue', '/loginx', '/nope'])(
    '%s has no fixed name',
    (pathname) => {
      expect(pageTitleKey(pathname)).toBeNull();
    },
  );
});

describe('formatPageTitle', () => {
  it('puts the page before the product', () => {
    expect(formatPageTitle('Cursos', 'Itera | Microlearning com IA')).toBe('Cursos | Itera');
    expect(formatPageTitle('  Dia 1  ', 'x')).toBe('Dia 1 | Itera');
  });

  it.each([null, undefined, '', '   '])('keeps the served title for %j', (name) => {
    expect(formatPageTitle(name, 'Itera | Microlearning com IA')).toBe('Itera | Microlearning com IA');
  });
});

describe('pageName', () => {
  it('tells its listeners only when the name changes', () => {
    const listener = vi.fn();
    const stop = pageName.subscribe(listener);
    pageName.set('Dia 1');
    pageName.set('Dia 1');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(pageName.get()).toBe('Dia 1');
    stop();
    pageName.set(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
