import { describe, expect, it } from 'vitest';
import { isPlayableFileUrl } from './OptionalVideoButton.js';

describe('isPlayableFileUrl', () => {
  it('accepts http(s) video files, case-insensitive, ignoring the query', () => {
    expect(isPlayableFileUrl('https://cdn.example.com/clip.mp4')).toBe(true);
    expect(isPlayableFileUrl('http://x.io/a/B.WEBM?sig=1')).toBe(true);
  });

  it('rejects video pages, other protocols and garbage', () => {
    expect(isPlayableFileUrl('https://www.youtube.com/watch?v=abc')).toBe(false);
    expect(isPlayableFileUrl('https://x.io/clip.mp4.html')).toBe(false);
    expect(isPlayableFileUrl('javascript:alert(1).mp4')).toBe(false);
    expect(isPlayableFileUrl('/relative/clip.mp4')).toBe(false);
    expect(isPlayableFileUrl('https://x.io/a.mov')).toBe(false);
    expect(isPlayableFileUrl('https://x.io/a.m4v')).toBe(false);
    expect(isPlayableFileUrl('')).toBe(false);
  });
});
