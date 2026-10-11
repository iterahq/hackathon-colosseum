import { describe, expect, it } from 'vitest';
import { thumbnailsOf } from './videoCourses';

const course = (id: string, thumbnailUrl: string | null, videoId: string) => ({ id, thumbnailUrl, lessons: [{ videoUrl: `https://www.youtube.com/embed/${videoId}`, position: 1 }] });

describe('thumbnailsOf', () => {
  it('gives a shared picture to the first course only; the next one shows its own first video', () => {
    const map = thumbnailsOf([course('a', 'https://s3/x.png', 'AAAAAAAAAAA'), course('b', 'https://s3/x.png', 'BBBBBBBBBBB'), course('c', null, 'CCCCCCCCCCC')]);
    expect(map.get('a')).toBe('https://s3/x.png');
    expect(map.get('b')).toBe('https://i.ytimg.com/vi/BBBBBBBBBBB/hqdefault.jpg');
    expect(map.get('c')).toBe('https://i.ytimg.com/vi/CCCCCCCCCCC/hqdefault.jpg');
  });

  it('keeps distinct pictures as they are', () => {
    const map = thumbnailsOf([course('a', 'https://s3/a.png', 'AAAAAAAAAAA'), course('b', 'https://s3/b.png', 'BBBBBBBBBBB')]);
    expect([...map.values()]).toEqual(['https://s3/a.png', 'https://s3/b.png']);
  });
});
