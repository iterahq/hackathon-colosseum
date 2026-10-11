import { describe, expect, it } from 'vitest';
import { progressStory } from './progressStory';

describe('progressStory', () => {
  it('sums the days of every trail and carries the graph counts', () => {
    const story = progressStory({
      pages: [
        { daysDone: 1, totalDays: 5 },
        { daysDone: 0, totalDays: 5 },
        { daysDone: 5, totalDays: 5 },
      ],
      pending: false,
      wallet: 'CQzi',
      capabilities: { verifiedCount: 2, total: 28 },
    });
    expect(story).toEqual({ daysDone: 6, daysTotal: 15, verified: 2, capabilitiesTotal: 28, wallet: 'CQzi', pending: false });
  });

  it('leaves the capability counts empty when no graph was read', () => {
    expect(progressStory({ pages: [], pending: true, wallet: null, capabilities: null })).toEqual({ daysDone: 0, daysTotal: 0, verified: null, capabilitiesTotal: null, wallet: null, pending: true });
  });
});
