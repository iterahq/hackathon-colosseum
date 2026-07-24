import { describe, it, expect } from 'vitest';
import { safeInternalPath } from '@/lib/safeInternalPath';

describe('safeInternalPath', () => {
  it('keeps a plain in-app path', () => {
    expect(safeInternalPath('/lesson/42')).toBe('/lesson/42');
    expect(safeInternalPath('/')).toBe('/');
  });

  it('rejects protocol-relative and backslash-smuggled redirects', () => {
    for (const evil of ['//evil.com', '/\\evil.com', '\\/evil.com', '\\\\evil.com', '/\\/\\evil.com']) {
      expect(safeInternalPath(evil)).toBe('/');
    }
  });

  it('rejects absolute URLs and non-path input', () => {
    expect(safeInternalPath('https://evil.com')).toBe('/');
    expect(safeInternalPath('javascript:alert(1)')).toBe('/');
    expect(safeInternalPath('lesson/42')).toBe('/');
    expect(safeInternalPath(null)).toBe('/');
    expect(safeInternalPath(undefined)).toBe('/');
    expect(safeInternalPath('')).toBe('/');
  });

  it('honors a custom fallback', () => {
    expect(safeInternalPath('//evil.com', '/login')).toBe('/login');
  });
});
