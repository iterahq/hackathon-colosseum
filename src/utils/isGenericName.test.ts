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

  it('flags the "User <uid-slice>" provisioning default', () => {
    expect(isGenericName('User c0c08d9d')).toBe(true);
    expect(isGenericName('user a1b2c3d4')).toBe(true);
    expect(isGenericName('USER 27104CB1')).toBe(true);
  });

  it('flags the email local-part fallback', () => {
    expect(isGenericName('samuelstefanodocarmo', 'samuelstefanodocarmo@gmail.com')).toBe(true);
  });

  it('accepts a real chosen name', () => {
    expect(isGenericName('Samuel Stefano')).toBe(false);
    expect(isGenericName('Ana', 'ana@x.com')).toBe(false);
    expect(isGenericName('Tainan Fidelis', 'taigfs@gmail.com')).toBe(false);
    // "User" as part of a real chosen name is NOT the provisioning default.
    expect(isGenericName('User Silva')).toBe(false);
    expect(isGenericName('Userson')).toBe(false);
  });

  it('flags wallet-shaped names, short and full', () => {
    expect(isGenericName('CQzi…DAhW')).toBe(true);
    expect(isGenericName('2rAa...nqA')).toBe(true);
    expect(isGenericName('HAF2UUMRqo7nwTm7H38EuwfnXJbSC9YTGJTw6CK8jL6')).toBe(true);
    expect(isGenericName('Ana...Clara!')).toBe(false);
  });
});
