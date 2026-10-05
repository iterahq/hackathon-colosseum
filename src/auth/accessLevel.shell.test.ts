import { describe, expect, it } from 'vitest';
import { hasPaidAccess, wasEntitledBeforeFailedRead } from './accessLevel';

describe('wasEntitledBeforeFailedRead', () => {
  it.each([
    ['a failed read after "entitled"', { entitlement: { active: true }, entitlementError: true }, true],
    ['a failed read after "not entitled"', { entitlement: { active: false }, entitlementError: true }, false],
    ['a failed read with no earlier answer', { entitlement: undefined, entitlementError: true }, false],
    ['a read that answered "entitled"', { entitlement: { active: true }, entitlementError: false }, false],
  ])('%s -> %s', (_what, input, expected) => {
    expect(wasEntitledBeforeFailedRead(input)).toBe(expected);
  });

  it('does not change the browser verdict: a failed read is never paid access', () => {
    expect(hasPaidAccess({ memberships: [], entitlement: { active: true }, entitlementError: true })).toBe(false);
  });
});
