import { describe, it, expect } from 'vitest';
import { reconnectDelayMs } from './liveReconnect';

describe('reconnectDelayMs', () => {
  it('ramps 1s → 2s → 5s → 10s → 15s', () => {
    expect(reconnectDelayMs(0)).toBe(1000);
    expect(reconnectDelayMs(1)).toBe(2000);
    expect(reconnectDelayMs(2)).toBe(5000);
    expect(reconnectDelayMs(3)).toBe(10000);
    expect(reconnectDelayMs(4)).toBe(15000);
  });

  it('caps at 15s for later attempts and clamps negatives', () => {
    expect(reconnectDelayMs(50)).toBe(15000);
    expect(reconnectDelayMs(-1)).toBe(1000);
  });
});
