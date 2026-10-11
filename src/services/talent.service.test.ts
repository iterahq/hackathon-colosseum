import { describe, expect, it } from 'vitest';
import { parseBoard, parseLearner, parseStatus } from './talent.service';

describe('talent service parsers', () => {
  it('reads a card and drops what has no wallet', () => {
    expect(parseLearner({})).toBeNull();
    const learner = parseLearner({
      wallet: 'W1',
      name: 'Ana',
      avatar: { key: 'tera_normal', title: 'Normal', thumb_url: 'https://x/a.png', rarity: 'common' },
      headline: 'Builds pages',
      stamped_days: 3,
      total_days: 15,
      certifications: 1,
      capabilities: [{ key: 'html-tags', title: 'Reads HTML' }, { key: 'x' }],
      bounties_paid: 2,
      bounties_paid_lamports: 20000000,
      last_stamp_at: '2026-10-11T10:00:00Z',
      profile_url: '/u/W1',
      team_test: true,
    });
    expect(learner).toMatchObject({ wallet: 'W1', stampedDays: 3, totalDays: 15, bountiesPaid: 2, teamTest: true, capabilities: [{ key: 'html-tags', title: 'Reads HTML' }] });
    expect(learner?.avatar?.thumbUrl).toBe('https://x/a.png');
  });
  it('falls back to the profile path and no avatar', () => {
    expect(parseLearner({ wallet: 'W2' })).toMatchObject({ profileUrl: '/u/W2', avatar: null, teamTest: false, stampedDays: 0 });
  });
  it('reads the board', () => {
    const board = parseBoard({ source: 'recorded', read_at: 'now', total_listed: 1, capabilities: [{ key: 'a', title: 'A' }], learners: [{ wallet: 'W' }, 5] });
    expect(board).toMatchObject({ source: 'recorded', totalListed: 1, capabilities: [{ key: 'a', title: 'A' }] });
    expect(board.learners).toHaveLength(1);
  });
  it('reads the status with its refusal reason', () => {
    expect(parseStatus({ wallet: 'W', listed: true, listing: { headline: 'Hi' }, may_list: true, reason: null, stamped_days: 2, total_days: 5 })).toMatchObject({ listed: true, headline: 'Hi', mayList: true, reason: null });
    expect(parseStatus({ may_list: false, reason: 'nothing_proven' })).toMatchObject({ listed: false, mayList: false, reason: 'nothing_proven' });
    expect(parseStatus({ reason: 'weird' }).reason).toBeNull();
  });
});
