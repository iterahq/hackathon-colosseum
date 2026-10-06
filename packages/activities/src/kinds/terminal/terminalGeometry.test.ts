import { describe, expect, it } from 'vitest';
import { TERMINAL_BODY, TERMINAL_TRANSCRIPT_SHORT } from './terminalGeometry';

const SHORT_PHONE = '[@media(max-height:700px)_and_(max-width:639px)]';

describe('terminal geometry', () => {
  it('keeps the 314 px floor everywhere but on a short phone', () => {
    const classes = TERMINAL_BODY.split(' ');
    expect(classes).toContain('min-h-[min(314px,40dvh)]');
    expect(classes).toContain(`${SHORT_PHONE}:min-h-[112px]`);
  });

  it('lets the transcript size to its content on a short phone', () => {
    expect(TERMINAL_TRANSCRIPT_SHORT.split(' ')).toEqual([
      `${SHORT_PHONE}:grow-0`,
      `${SHORT_PHONE}:basis-auto`,
      `${SHORT_PHONE}:max-h-[26dvh]`,
    ]);
  });
});
