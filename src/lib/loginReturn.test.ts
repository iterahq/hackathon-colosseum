import { describe, expect, it } from 'vitest';
import { loginHref, returnPathOf, returnState } from './loginReturn';

describe('returnPathOf', () => {
  it('reads the path a page asked to come back to', () => {
    expect(returnPathOf({ state: null, search: '?next=%2Fbounties%2Fcard-de-evento-responsivo' })).toBe('/bounties/card-de-evento-responsivo');
  });

  it('prefers the router state over the query', () => {
    expect(returnPathOf({ state: { from: { pathname: '/shop' } }, search: '?next=%2Fbounties' })).toBe('/shop');
  });

  it('falls back to home with nothing to return to', () => {
    expect(returnPathOf({ state: null, search: '' })).toBe('/');
    expect(returnPathOf({ state: {}, search: '?other=1' })).toBe('/');
  });

  it.each(['https://evil.example/x', '//evil.example', '/\\evil.example', '/%09/evil.example'.replace('%09', '\t'), 'javascript:alert(1)'])('refuses %j as a destination', (next) => {
    expect(returnPathOf({ state: null, search: `?next=${encodeURIComponent(next)}` })).toBe('/');
    expect(returnPathOf({ state: { from: { pathname: next } }, search: '' })).toBe('/');
  });
});

describe('loginHref', () => {
  it('carries the page in the link, so a full reload keeps it', () => {
    expect(loginHref('/bounties/card-de-evento-responsivo')).toBe('/login?next=%2Fbounties%2Fcard-de-evento-responsivo');
    expect(returnPathOf({ state: null, search: loginHref('/bounties/manage').slice('/login'.length) })).toBe('/bounties/manage');
  });

  it('is the plain login for home or an unsafe path', () => {
    expect(loginHref('/')).toBe('/login');
    expect(loginHref('//evil.example')).toBe('/login');
  });
});

describe('returnState', () => {
  it('has the shape the login pages read', () => {
    expect(returnPathOf({ state: returnState('/bounties'), search: '' })).toBe('/bounties');
  });
});
