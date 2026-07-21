import { describe, it, expect } from 'vitest';
import { validateNewPassword } from './validateNewPassword';

describe('validateNewPassword', () => {
  it('rejects passwords under 8 chars as weak', () => {
    expect(validateNewPassword('abc123', 'abc123')).toBe('weak');
    expect(validateNewPassword('', '')).toBe('weak');
  });

  it('flags weak before mismatch', () => {
    expect(validateNewPassword('short', 'different')).toBe('weak');
  });

  it('rejects non-matching confirmation', () => {
    expect(validateNewPassword('longenough1', 'longenough2')).toBe('mismatch');
  });

  it('accepts a matching 8+ char password', () => {
    expect(validateNewPassword('longenough1', 'longenough1')).toBeNull();
  });
});
