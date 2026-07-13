import { describe, it, expect } from 'vitest';
import { isGenericName } from './isGenericName';

describe('isGenericName', () => {
  it('flags empty / null / placeholder names', () => {
    expect(isGenericName(null)).toBe(true);
    expect(isGenericName(undefined)).toBe(true);
    expect(isGenericName('  ')).toBe(true);
    expect(isGenericName('Aluno')).toBe(true);
    expect(isGenericName('student')).toBe(true);
  });

  it('flags a uid-slice fallback', () => {
    expect(isGenericName('a1b2c3d4')).toBe(true);
    expect(isGenericName('27104cb1')).toBe(true);
  });

  it('flags the email local-part fallback', () => {
    expect(isGenericName('samuelstefanodocarmo', 'samuelstefanodocarmo@gmail.com')).toBe(true);
  });

  it('accepts a real chosen name', () => {
    expect(isGenericName('Samuel Stefano')).toBe(false);
    expect(isGenericName('Ana', 'ana@x.com')).toBe(false);
    expect(isGenericName('Tainan Fidelis', 'taigfs@gmail.com')).toBe(false);
  });
});
