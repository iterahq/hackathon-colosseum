import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountKeyboardVisibility } from './keyboard-visibility-mount';

type Handler = () => void;

function setup({ coarse = true, innerHeight = 844 }: { coarse?: boolean; innerHeight?: number } = {}) {
  const docHandlers: Record<string, Handler> = {};
  const vvHandlers: Record<string, Handler> = {};
  const setProperty = vi.fn();
  const vv = {
    height: innerHeight,
    offsetTop: 0,
    scale: 1,
    addEventListener: vi.fn((name: string, fn: Handler) => (vvHandlers[name] = fn)),
  };
  const doc = {
    activeElement: document.body as Element | null,
    addEventListener: vi.fn((name: string, fn: Handler) => (docHandlers[name] = fn)),
    documentElement: { style: { setProperty } },
  };
  const win = {
    matchMedia: () => ({ matches: coarse }),
    document: doc,
    visualViewport: vv,
    innerHeight,
    scrollBy: vi.fn(),
  };
  mountKeyboardVisibility(win as unknown as Window);

  const field = (top: number, bottom: number) => {
    const el = document.createElement('textarea');
    el.getBoundingClientRect = () => ({ top, bottom, left: 0, right: 300, width: 300, height: bottom - top }) as DOMRect;
    return el;
  };
  const insets = () => setProperty.mock.calls.map((c) => c[1] as string);
  return {
    win,
    vv,
    doc,
    field,
    insets,
    lastInset: () => insets().at(-1),
    focus: (el: Element) => {
      doc.activeElement = el;
      docHandlers.focusin?.();
    },
    blur: () => {
      doc.activeElement = document.body;
      docHandlers.focusout?.();
    },
    resize: () => vvHandlers.resize?.(),
    keyboard: (height: number, offsetTop = 0) => {
      vv.height = height;
      vv.offsetTop = offsetTop;
      vvHandlers.resize?.();
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('mountKeyboardVisibility', () => {
  it('does nothing with a fine pointer', () => {
    const t = setup({ coarse: false });
    expect(t.doc.addEventListener).not.toHaveBeenCalled();
    expect(t.vv.addEventListener).not.toHaveBeenCalled();
    expect(t.insets()).toEqual([]);
  });

  it('moves a clipped field once, to the middle of the area the keyboard left, with the page panned', () => {
    const t = setup();
    const el = t.field(560, 690);
    t.focus(el);
    t.keyboard(508, 100);
    vi.advanceTimersByTime(130);
    expect(t.win.scrollBy).toHaveBeenCalledTimes(1);
    expect(t.win.scrollBy).toHaveBeenCalledWith(0, 625 - (100 + 608) / 2);
  });

  it('does not touch a field the browser already panned into view', () => {
    const t = setup();
    t.focus(t.field(700, 830));
    t.keyboard(508, 336);
    vi.advanceTimersByTime(500);
    expect(t.win.scrollBy).not.toHaveBeenCalled();
  });

  it('does not treat a pinch zoom as a keyboard', () => {
    const t = setup();
    t.vv.scale = 2;
    t.focus(t.field(700, 830));
    t.keyboard(422);
    vi.advanceTimersByTime(500);
    expect(t.lastInset()).toBe('0px');
    expect(t.win.scrollBy).not.toHaveBeenCalled();
  });

  it('waits for the resize when the focus lands before the keyboard', () => {
    const t = setup();
    t.focus(t.field(700, 830));
    vi.advanceTimersByTime(300);
    expect(t.win.scrollBy).not.toHaveBeenCalled();
    t.keyboard(508);
    vi.advanceTimersByTime(130);
    expect(t.win.scrollBy).toHaveBeenCalledTimes(1);
  });

  it('keeps one late pass for a platform that never fires a resize', () => {
    const t = setup();
    t.focus(t.field(700, 830));
    t.vv.height = 508;
    vi.advanceTimersByTime(390);
    expect(t.win.scrollBy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(t.win.scrollBy).toHaveBeenCalledTimes(1);
  });

  it('acts once after several resize events of the same transition', () => {
    const t = setup();
    t.focus(t.field(700, 830));
    for (const h of [700, 600, 508]) {
      t.keyboard(h);
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(130);
    expect(t.win.scrollBy).toHaveBeenCalledTimes(1);
  });

  it('keeps the inset when focus leaves while the keyboard is still up, and drops it on the closing resize', () => {
    const t = setup();
    t.focus(t.field(700, 830));
    t.keyboard(508);
    vi.advanceTimersByTime(130);
    expect(t.lastInset()).toBe('368px');
    const seen = t.insets().length;
    t.blur();
    vi.advanceTimersByTime(500);
    expect(t.insets().slice(seen)).not.toContain('0px');
    t.keyboard(844);
    expect(t.lastInset()).toBe('0px');
  });

  it('keeps the inset when focus moves from one field to another', () => {
    const t = setup();
    t.focus(t.field(700, 830));
    t.keyboard(508);
    vi.advanceTimersByTime(130);
    const seen = t.insets().length;
    t.blur();
    t.focus(t.field(300, 340));
    vi.advanceTimersByTime(500);
    expect(t.insets().slice(seen)).not.toContain('0px');
    expect(t.win.scrollBy).toHaveBeenCalledTimes(1);
  });

  it('survives the focused element being removed', () => {
    const t = setup();
    t.focus(t.field(700, 830));
    t.keyboard(508);
    t.doc.activeElement = document.body;
    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    expect(t.win.scrollBy).not.toHaveBeenCalled();
    t.keyboard(844);
    expect(t.lastInset()).toBe('0px');
  });
});
