import { describe, expect, it } from 'vitest';
import { snapshotWhen } from './snapshot';

describe('snapshotWhen', () => {
  it('formats a mirror time in local time', () => {
    expect(snapshotWhen('2026-10-10T12:30:00Z', 'en')).toMatch(/10\/10\/26|10\/9\/26|10\/10\/2026/);
    expect(snapshotWhen('2026-10-10T12:30:00Z', 'pt')).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('is null for missing or broken input', () => {
    expect(snapshotWhen(null, 'pt')).toBeNull();
    expect(snapshotWhen('nope', 'pt')).toBeNull();
  });
});
