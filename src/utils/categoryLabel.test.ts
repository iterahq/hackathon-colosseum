import { describe, it, expect } from 'vitest';
import { categoryLabel } from './categoryLabel';

describe('categoryLabel', () => {
  it('replaces the internal " / " separator with " · "', () => {
    expect(categoryLabel('sparkles')).toBe('AI · ML');
  });

  it('leaves a label with no separator unchanged', () => {
    expect(categoryLabel('code')).toBe('Frontend');
  });

  it('falls back to the default category for an unknown icon', () => {
    expect(categoryLabel(undefined)).toBe('Frontend');
  });
});
