import { describe, expect, it } from 'vitest';
import { parseInline, parseRichText } from './richText.js';

describe('parseInline — ==key phrase==', () => {
  it('parses a mark span', () => {
    expect(parseInline('the ==key phrase== here')).toEqual([
      { type: 'text', value: 'the ' },
      { type: 'mark', spans: [{ type: 'text', value: 'key phrase' }] },
      { type: 'text', value: ' here' },
    ]);
  });

  it('nests bold and code inside a mark', () => {
    const [mark] = parseInline('==run **now** `git pull`==');
    expect(mark).toMatchObject({ type: 'mark' });
    const types = (mark as { spans: { type: string }[] }).spans.map((s) => s.type);
    expect(types).toEqual(['text', 'strong', 'text', 'code']);
  });

  it('does not cross a newline', () => {
    expect(parseInline('a ==open\nclose== b').some((s) => s.type === 'mark')).toBe(false);
  });

  it('leaves comparison operators alone', () => {
    expect(parseInline('a == b == c')).toEqual([{ type: 'text', value: 'a == b == c' }]);
  });
});

describe('parseRichText — media', () => {
  it('turns a lone image line into a media block', () => {
    expect(parseRichText('![before](/lesson-media/a.png)')).toEqual([
      { type: 'media', items: [{ caption: 'before', url: '/lesson-media/a.png', kind: 'image' }] },
    ]);
  });

  it('turns two tokens on one line into a pair', () => {
    const [block] = parseRichText('![before](/lesson-media/a.gif) ![after](https://x.test/b.mp4)');
    expect(block).toEqual({
      type: 'media',
      items: [
        { caption: 'before', url: '/lesson-media/a.gif', kind: 'image' },
        { caption: 'after', url: 'https://x.test/b.mp4', kind: 'video' },
      ],
    });
  });

  it('detects video by extension, ignoring the query string', () => {
    const [block] = parseRichText('![](https://x.test/c.WEBM?v=2)');
    expect(block).toMatchObject({ items: [{ kind: 'video' }] });
  });

  it('rejects unsafe urls and emits nothing', () => {
    expect(parseRichText('![x](javascript:alert)')).toEqual([]);
    expect(parseRichText('![x](http://x.test/a.png)')).toEqual([]);
    expect(parseRichText('![x](https://x.test/a.exe)')).toEqual([]);
  });

  it('keeps only the valid half of a pair', () => {
    const [block] = parseRichText('![a](javascript:x) ![b](/lesson-media/b.png)');
    expect(block).toMatchObject({ items: [{ caption: 'b' }] });
  });

  it('leaves an image inside a sentence as plain text', () => {
    expect(parseRichText('see ![a](/lesson-media/a.png) here')[0].type).toBe('paragraph');
  });
});
