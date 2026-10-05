import { describe, it, expect } from 'vitest';
import { ACTIVITY_KINDS } from '@iterahq/activity-spec';
import { ONE_BEHAVIOUR_KINDS } from '@iterahq/activities';
import { resources } from '@/i18n';
import { kindLabelKey } from './skillTreeKindLabel';

describe('kindLabelKey', () => {
  it('maps snake_case and one-behaviour kinds onto the dictionary keys', () => {
    expect(kindLabelKey('concept')).toBe('activity.concept');
    expect(kindLabelKey('single_choice')).toBe('activity.singleChoice');
    expect(kindLabelKey('code_fill_bank')).toBe('activity.code');
    expect(kindLabelKey('terminal_pick_command')).toBe('activity.terminalSandbox');
  });

  it('has a label in both locales for every kind a lesson can open with', () => {
    for (const kind of [...ACTIVITY_KINDS, ...ONE_BEHAVIOUR_KINDS]) {
      for (const locale of ['pt', 'en'] as const) {
        expect(resources[locale][kindLabelKey(kind)], `${locale} ${kind}`).toBeTruthy();
      }
    }
  });
});
