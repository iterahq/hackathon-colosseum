import { beforeEach, describe, expect, it, vi } from 'vitest';

const surface = vi.hoisted(() => ({ value: 'pending' as 'pending' | 'web' | 'shell', listeners: new Set<() => void>() }));
vi.mock('./shellSurface', () => ({
  readShellSurface: () => surface.value,
  subscribeShellSurface: (fn: () => void) => {
    surface.listeners.add(fn);
    return () => surface.listeners.delete(fn);
  },
}));

import { mountShellViewport } from './shell-viewport-mount';

const INITIAL = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

function page(): Document {
  const doc = document.implementation.createHTMLDocument('');
  const meta = doc.createElement('meta');
  meta.setAttribute('name', 'viewport');
  meta.setAttribute('content', INITIAL);
  doc.head.append(meta);
  return doc;
}

const content = (doc: Document) => doc.querySelector('meta[name="viewport"]')?.getAttribute('content');

describe('mountShellViewport', () => {
  beforeEach(() => {
    surface.value = 'pending';
    surface.listeners.clear();
  });

  it('leaves a browser tab zoomable', () => {
    surface.value = 'web';
    const doc = page();
    mountShellViewport(doc);
    expect(content(doc)).toBe(INITIAL);
  });

  it('pins the scale at once when the shell already answered', () => {
    surface.value = 'shell';
    const doc = page();
    mountShellViewport(doc);
    expect(content(doc)).toBe(`${INITIAL}, maximum-scale=1, user-scalable=no`);
    expect(surface.listeners.size).toBe(0);
  });

  it('waits for the handshake, then pins the scale and stops listening', () => {
    const doc = page();
    mountShellViewport(doc);
    expect(content(doc)).toBe(INITIAL);
    surface.value = 'shell';
    for (const fn of [...surface.listeners]) fn();
    expect(content(doc)).toBe(`${INITIAL}, maximum-scale=1, user-scalable=no`);
    expect(surface.listeners.size).toBe(0);
  });

  it('stays zoomable when the handshake settles on web', () => {
    const doc = page();
    mountShellViewport(doc);
    surface.value = 'web';
    for (const fn of [...surface.listeners]) fn();
    expect(content(doc)).toBe(INITIAL);
  });
});
