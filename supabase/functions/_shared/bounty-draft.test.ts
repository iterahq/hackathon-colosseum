import { describe, expect, it } from 'vitest';
import { draftVerdict } from './bounty-draft.ts';

const draft = { origin: 'wallet', sponsor_wallet: 'W1', status: 'awaiting_funding', funded_at: null } as const;

describe('draftVerdict', () => {
  it('lets a wallet delete its own unfunded draft', () => {
    expect(draftVerdict(draft, 'W1')).toBe('ok');
  });
  it('treats another wallet\'s bounty as not found', () => {
    expect(draftVerdict(draft, 'W2')).toBe('not_found');
  });
  it('treats a team bounty as not found', () => {
    expect(draftVerdict({ ...draft, origin: 'team' }, 'W1')).toBe('not_found');
  });
  it('refuses a bounty that was funded or is past the draft', () => {
    expect(draftVerdict({ ...draft, funded_at: '2026-10-11T00:00:00Z' }, 'W1')).toBe('not_a_draft');
    expect(draftVerdict({ ...draft, status: 'open' }, 'W1')).toBe('not_a_draft');
    expect(draftVerdict({ ...draft, status: 'refunded' }, 'W1')).toBe('not_a_draft');
  });
});
