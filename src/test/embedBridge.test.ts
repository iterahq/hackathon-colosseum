import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '@/auth/embedBridge';

/**
 * The embed bridge MUST only trust DFL_SET_TOKEN messages from DFL/learn
 * origins (and localhost for dev). Anything else could inject a session.
 */
describe('embed bridge — parent origin allowlist', () => {
  it('allows learn.devfellowship.com and devfellowship.com subdomains', () => {
    expect(isAllowedOrigin('https://learn.devfellowship.com')).toBe(true);
    expect(isAllowedOrigin('https://app.devfellowship.com')).toBe(true);
    expect(isAllowedOrigin('https://devfellowship.com')).toBe(true);
  });

  it('allows localhost / 127.0.0.1 (dev)', () => {
    expect(isAllowedOrigin('http://localhost:8080')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true);
  });

  it('rejects unrelated / look-alike origins', () => {
    expect(isAllowedOrigin('https://evil.com')).toBe(false);
    expect(isAllowedOrigin('https://devfellowship.com.evil.com')).toBe(false);
    expect(isAllowedOrigin('https://learn.devfellowship.com.evil.com')).toBe(false);
    expect(isAllowedOrigin('https://notdevfellowship.com')).toBe(false);
    expect(isAllowedOrigin('null')).toBe(false);
  });
});
