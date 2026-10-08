import { describe, expect, it } from 'vitest';
import { lessonImageUrls, upcomingImageUrls } from './lessonMediaPreload';

const A = '/lesson-media/basico-frontend/a.png';
const B = '/lesson-media/basico-frontend/b.svg';

describe('lessonImageUrls', () => {
  it('finds the image of an instruction, of an option and of a markdown block, once each', () => {
    const spec = {
      instruction: { image_url: A, text: { pt: `Veja ![legenda](${B}) e de novo ![x](${B})` } },
      options: [{ id: 'a', image_url: A }],
    };
    expect(lessonImageUrls(spec)).toEqual([A, B]);
  });

  it('leaves clips and anything outside /lesson-media/ alone', () => {
    const spec = { instruction: { text: '![clip](/lesson-media/x/clip.mp4) ![ext](https://example.com/y.png)' } };
    expect(lessonImageUrls(spec)).toEqual([]);
  });

  it('returns nothing for an empty spec', () => {
    expect(lessonImageUrls(undefined)).toEqual([]);
    expect(lessonImageUrls(null)).toEqual([]);
  });
});

describe('upcomingImageUrls', () => {
  const activities = [
    { spec: { instruction: { image_url: A } } },
    { spec: {} },
    { spec: { instruction: { image_url: B } } },
    { spec: { instruction: { image_url: A } } },
  ];

  it('reads only the next two activities, never the current one', () => {
    expect(upcomingImageUrls(activities, 0)).toEqual([B]);
    expect(upcomingImageUrls(activities, 1)).toEqual([B, A]);
  });

  it('is empty at the end of the lesson', () => {
    expect(upcomingImageUrls(activities, 3)).toEqual([]);
  });
});
