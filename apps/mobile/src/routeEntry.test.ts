import { describe, expect, it } from 'vitest';
import { createReturnLatch } from './dflAuthSession';
import { entryFromLink } from './deepLink';
import { nextEntry as next, type EntryInput, type RouteEntry } from './routeEntry';

const CB = '/auth/dfl/callback#dfl_token=a.b.c';
const view = (path: string) => `${path}\n{}`;
const nextEntry = (input: Omit<EntryInput, 'focused'> & { focused?: boolean }) => next({ focused: true, ...input });
const entryOf = (raw: string): RouteEntry => ({ raw, effective: raw, view: view(raw), leaving: false });

describe('nextEntry', () => {
  it('a first render takes the raw entry; the latch is not asked for an entry that is not the callback', () => {
    const e = nextEntry({ previous: null, rawEntry: '/', view: view('/'), arrival: () => null, canPop: false });
    expect(e).toEqual({ raw: '/', effective: '/', view: view('/'), leaving: false });
  });

  it('the same raw entry keeps the entry, takes the new view and never asks the latch again', () => {
    let asked = 0;
    const previous: RouteEntry = { raw: CB, effective: '/login', view: 'old', leaving: false };
    const e = nextEntry({ previous, rawEntry: CB, view: 'new', arrival: () => (asked++, 'load'), canPop: true });
    expect(asked).toBe(0);
    expect(e).toEqual({ ...previous, view: 'new' });
  });

  it('a leaving entry stays leaving on later renders, whatever canPop says then', () => {
    const previous: RouteEntry = { raw: CB, effective: CB, view: 'a', leaving: true };
    expect(nextEntry({ previous, rawEntry: CB, view: 'b', arrival: () => null, canPop: false }).leaving).toBe(true);
  });

  it('a load answer on a reused instance takes the new raw entry', () => {
    const e = nextEntry({ previous: entryOf('/login'), rawEntry: CB, view: view(CB), arrival: () => 'load', canPop: true });
    expect(e).toMatchObject({ raw: CB, effective: CB, leaving: false });
  });

  it('a duplicate on a reused instance keeps the entry it had', () => {
    const e = nextEntry({ previous: entryOf('/login'), rawEntry: CB, view: view(CB), arrival: () => 'duplicate', canPop: true });
    expect(e).toMatchObject({ raw: CB, effective: '/login', leaving: false });
  });

  it('a duplicate on a fresh instance with a route beneath leaves', () => {
    const e = nextEntry({ previous: null, rawEntry: CB, view: view(CB), arrival: () => 'duplicate', canPop: true });
    expect(e.leaving).toBe(true);
  });

  it('a duplicate on a fresh instance with nothing beneath shows the entry: no other WebView holds it', () => {
    const e = nextEntry({ previous: null, rawEntry: CB, view: view(CB), arrival: () => 'duplicate', canPop: false });
    expect(e).toMatchObject({ effective: CB, leaving: false });
  });
});

describe('an instance that is not focused keeps its entry (usePathname() is global)', () => {
  const unfocused = (previous: RouteEntry, rawEntry: string, arrival: EntryInput['arrival'] = () => 'load') => nextEntry({ previous, rawEntry, view: view(rawEntry), arrival, canPop: true, focused: false });

  it('the instance beneath ignores a plain warm deep link over it, and never asks the latch', () => {
    let asked = 0;
    const beneath = entryOf('/');
    expect(unfocused(beneath, '/lesson/x', () => (asked++, 'load'))).toBe(beneath);
    expect(asked).toBe(0);
  });

  it('the instance beneath ignores the DFL return, whatever the latch would say', () => {
    for (const answer of ['load', 'duplicate'] as const) {
      const beneath = entryOf('/');
      expect(unfocused(beneath, CB, () => answer)).toBe(beneath);
    }
  });

  it('a page the session loaded into the instance beneath is not rebuilt either', () => {
    const beneath: RouteEntry = { raw: '/', effective: '/', view: view('/'), leaving: false };
    expect(unfocused(beneath, '/auth/dfl/callback').effective).toBe('/');
  });

  it('the first render of an instance has no entry to keep: it computes one, focused or not', () => {
    expect(nextEntry({ previous: null, rawEntry: '/x', view: view('/x'), arrival: () => null, canPop: true, focused: false }).effective).toBe('/x');
  });

  it('a focused instance recomputes: a reused [...path] for a new link, and a pushed one catching up with the store', () => {
    expect(nextEntry({ previous: entryOf('/lesson/a'), rawEntry: '/lesson/b', view: view('/lesson/b'), arrival: () => null, canPop: true }).effective).toBe('/lesson/b');
  });

  it('after the pop the instance beneath is focused again with its own pathname: same view, same entry, no remount', () => {
    const beneath = entryOf('/');
    const refocused = nextEntry({ previous: beneath, rawEntry: '/', view: view('/'), arrival: () => null, canPop: false });
    expect(refocused).toEqual(beneath);
    expect(refocused.effective).toBe(beneath.effective);
  });

  it('a route-local `path` param cannot choose the route: the entry is built from the pathname segments only', () => {
    expect(entryFromLink(null, 'https://app.iterahq.dev', [], { path: ['admin'] })).toBe('/');
    expect(entryFromLink(null, 'https://app.iterahq.dev', ['catalog'], { path: ['lesson', 'x'] })).toBe('/catalog');
  });
});

// Both arrival orders x both starting routes, with the real latch. The order Android is expected to produce is router first (the pushed
// instance loads, the session's copy is the duplicate); the session-first order is the defensive path and has not been run on a device.
describe('the DFL return on Android: exactly one WebView holds the callback', () => {
  const setup = () => {
    const latch = createReturnLatch(() => 0);
    latch.begin();
    return latch;
  };
  const routerArrives = (latch: ReturnType<typeof setup>, previous: RouteEntry | null, canPop: boolean, focused = true) =>
    nextEntry({ previous, rawEntry: CB, view: view(CB), arrival: () => latch.arrive('router'), canPop, focused });

  it('started on index, router first (expected order): the pushed instance loads, the instance beneath keeps its page, the session copy is dropped', () => {
    const latch = setup();
    const beneath = entryOf('/');
    const pushed = routerArrives(latch, null, true);
    expect(pushed).toMatchObject({ effective: CB, leaving: false });
    expect(routerArrives(latch, beneath, true, false)).toBe(beneath);
    expect(latch.arrive('session')).toBe('duplicate');
  });

  it('started on index, session first (defensive path): the pushed instance leaves, the instance beneath keeps the page it loaded', () => {
    const latch = setup();
    const beneath = entryOf('/');
    expect(latch.arrive('session')).toBe('load');
    expect(routerArrives(latch, null, true).leaving).toBe(true);
    expect(routerArrives(latch, beneath, true, false)).toBe(beneath);
  });

  it('the pushed instance keeps its callback entry on its later renders, and the instance beneath still has its own after the pop', () => {
    const latch = setup();
    const beneath = entryOf('/');
    const pushed = routerArrives(latch, null, true);
    expect(nextEntry({ previous: pushed, rawEntry: CB, view: view(CB), arrival: () => null, canPop: true })).toMatchObject({ effective: CB });
    const afterPop = nextEntry({ previous: beneath, rawEntry: '/', view: view('/'), arrival: () => null, canPop: false });
    expect(afterPop).toEqual(beneath);
  });

  it('started on a [...path] instance, router first: the reused instance loads and the session copy is dropped', () => {
    const latch = setup();
    expect(routerArrives(latch, entryOf('/lesson/x'), true)).toMatchObject({ effective: CB, leaving: false });
    expect(latch.arrive('session')).toBe('duplicate');
  });

  it('started on a [...path] instance, session first: the reused instance keeps its entry', () => {
    const latch = setup();
    expect(latch.arrive('session')).toBe('load');
    expect(routerArrives(latch, entryOf('/lesson/x'), true)).toMatchObject({ effective: '/lesson/x', leaving: false });
  });

  it('a callback link opened from outside, with no session, loads on a fresh instance', () => {
    const latch = createReturnLatch(() => 0);
    expect(routerArrives(latch, null, false)).toMatchObject({ effective: CB, leaving: false });
  });
});
