import { describe, expect, it } from 'vitest';
import { progressStory } from './progressStory';

describe('progressStory', () => {
  it('sums the days of every trail and carries the graph counts', () => {
    const story = progressStory({
      pages: [
        { daysDone: 1, daysStamped: 0, totalDays: 5, trailTitle: 'HTML' },
        { daysDone: 0, daysStamped: 0, totalDays: 5, trailTitle: 'CSS' },
        { daysDone: 5, daysStamped: 5, totalDays: 5, trailTitle: 'JavaScript' },
      ],
      pending: false,
      wallet: 'CQzi',
      capabilities: { verifiedCount: 2, total: 28 },
    });
    expect(story).toEqual({ daysDone: 6, daysStamped: 5, daysPending: 1, daysTotal: 15, verified: 2, capabilitiesTotal: 28, wallet: 'CQzi', pending: false, lead: { title: 'JavaScript', daysDone: 5, daysStamped: 5, totalDays: 5 } });
  });

  it('leads with the first trail until a day is done', () => {
    const story = progressStory({ pages: [{ daysDone: 0, daysStamped: 0, totalDays: 5, trailTitle: 'HTML' }, { daysDone: 0, daysStamped: 0, totalDays: 5, trailTitle: 'CSS' }], pending: false, wallet: null, capabilities: null });
    expect(story.lead).toEqual({ title: 'HTML', daysDone: 0, daysStamped: 0, totalDays: 5 });
  });

  it('leaves the capability counts empty when no graph was read', () => {
    expect(progressStory({ pages: [], pending: true, wallet: null, capabilities: null })).toEqual({ daysDone: 0, daysStamped: 0, daysPending: 0, daysTotal: 0, verified: null, capabilitiesTotal: null, wallet: null, pending: true, lead: null });
  });
});
