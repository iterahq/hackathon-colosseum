import { describe, it, expect } from 'vitest';
import { learnerActivityGate } from './liveActivityGate';

const base = { kind: 'read_and_choose', timerRunning: false, expired: false, answered: false };

describe('learnerActivityGate', () => {
  describe('P0-2 pre-start gate', () => {
    it('is inert (pre-start) when advanced-to but not yet started', () => {
      const g = learnerActivityGate({ ...base });
      expect(g.started).toBe(false);
      expect(g.preStart).toBe(true);
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });

    it('opens once the timer is running', () => {
      const g = learnerActivityGate({ ...base, timerRunning: true });
      expect(g.started).toBe(true);
      expect(g.preStart).toBe(false);
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
    });

    it('exempts sandbox_scenario (facilitator-driven) from the pre-start gate', () => {
      const g = learnerActivityGate({ ...base, kind: 'sandbox_scenario' });
      expect(g.preStart).toBe(false);
      expect(g.readOnly).toBe(false);
      expect(g.canComplete).toBe(true);
    });
  });

  describe('P0-1 expiry locks, never completes', () => {
    it('locks read-only when the timer expired before answering', () => {
      const g = learnerActivityGate({ ...base, timerRunning: false, expired: true });
      expect(g.started).toBe(true);
      expect(g.locked).toBe(true);
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });

    it('never allows a completion after expiry (no auto-complete/advance)', () => {
      const g = learnerActivityGate({ ...base, expired: true });
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
      const g = learnerActivityGate({ ...base, timerRunning: true, answered: true });
      expect(g.readOnly).toBe(true);
      expect(g.canComplete).toBe(false);
    });
  });
});
