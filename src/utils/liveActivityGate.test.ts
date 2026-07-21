import { describe, it, expect } from 'vitest';
import { learnerActivityGate } from './liveActivityGate';

const base = { timerRunning: false, expired: false, answered: false };

describe('learnerActivityGate', () => {
  describe('interactive on arrival (no pre-start gate)', () => {
    it('lets the learner answer as soon as the activity is advanced to', () => {
      const g = learnerActivityGate({ ...base });
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
      expect(g.locked).toBe(false);
    });

    it('stays interactive while a timer runs', () => {
      const g = learnerActivityGate({ ...base, timerRunning: true });
      expect(g.started).toBe(true);
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
    });
  });

  describe('expiry locks, never completes', () => {
    it('locks read-only when the timer expired before answering', () => {
      const g = learnerActivityGate({ ...base, expired: true });
      expect(g.started).toBe(true);
      expect(g.locked).toBe(true);
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });

    it('does not re-lock an activity the learner already answered before expiry', () => {
      const g = learnerActivityGate({ ...base, timerRunning: true, expired: true, answered: true });
      expect(g.locked).toBe(false);
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });
  });

  describe('answered', () => {
    it('is read-only and cannot re-complete once answered', () => {
      const g = learnerActivityGate({ ...base, answered: true });
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });
  });
});
