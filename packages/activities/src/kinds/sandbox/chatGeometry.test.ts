import { describe, expect, it } from 'vitest';
import { CHAT_SCROLL, CHAT_SCROLL_END } from './chatGeometry';

const SHORT_PHONE = '[@media(max-height:700px)_and_(max-width:639px)]';
const TALL_PHONE = '[@media(min-height:701px)_and_(max-width:639px)]';

describe('CHAT_SCROLL', () => {
  it('lets the transcript take its content height on a short phone, so the composer stays above the fold', () => {
    const classes = CHAT_SCROLL.split(' ');
    expect(classes).toContain(`${SHORT_PHONE}:h-auto`);
    expect(classes).toContain(`${SHORT_PHONE}:max-h-[28dvh]`);
    expect(CHAT_SCROLL_END).toBe(`${SHORT_PHONE}:-mt-3.5`);
  });

  it('shortens the box on a taller phone and leaves the laptop shape alone', () => {
    const classes = CHAT_SCROLL.split(' ');
    expect(classes).toContain(`${TALL_PHONE}:h-[30dvh]`);
    expect(classes).toEqual(expect.arrayContaining(['h-[34dvh]', 'min-h-[220px]', 'max-h-[400px]']));
  });
});
