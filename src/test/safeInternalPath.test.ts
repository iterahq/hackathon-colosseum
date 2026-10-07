import { describe, it, expect } from 'vitest';
import { safeInternalPath } from '@/lib/safeInternalPath';

describe('safeInternalPath control characters', () => {
  it.each(['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', ' /lesson', '/a b', '/a\\b', '/a\u0000b', '/a\u007fb'])(
    'rejects %j',
    (raw) => {
      expect(safeInternalPath(raw)).toBe('/');
    },
  );

  it.each(['/lesson/42?a=1&b=2#h', '/a%20b', '/caf\u00e9/aula', '/program/x', '/'])('keeps %j', (raw) => {
    expect(safeInternalPath(raw)).toBe(raw);
  });
});

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
