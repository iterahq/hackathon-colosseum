import { describe, it, expect } from 'vitest';
import { Code, Rocket } from 'lucide-react';
import { iconForCategory } from './iconForCategory';

describe('iconForCategory', () => {
  it('resolves a known category key to its icon', () => {
    expect(iconForCategory('rocket')).toBe(Rocket);
  });

  it('falls back to the code icon for an unknown or missing key', () => {
    expect(iconForCategory('nope')).toBe(Code);
    expect(iconForCategory(undefined)).toBe(Code);
  });
});
