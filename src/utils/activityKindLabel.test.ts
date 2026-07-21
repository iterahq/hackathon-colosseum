import { describe, it, expect } from 'vitest';
import { activityKindLabelKey } from './activityKindLabel';

describe('activityKindLabelKey', () => {
  it('maps known kinds to their live.kind.* key', () => {
    expect(activityKindLabelKey('concept')).toBe('live.kind.concept');
    expect(activityKindLabelKey('single_choice')).toBe('live.kind.single_choice');
    expect(activityKindLabelKey('sandbox_scenario')).toBe('live.kind.sandbox_scenario');
  });

  it('falls back to a generic key for unknown kinds (no raw enum leak)', () => {
    expect(activityKindLabelKey('')).toBe('live.kind.unknown');
    expect(activityKindLabelKey('mystery_type')).toBe('live.kind.unknown');
  });
});
