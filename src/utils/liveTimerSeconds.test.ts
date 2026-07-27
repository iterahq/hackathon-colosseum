import { describe, it, expect } from 'vitest';
import { formatMmss } from './formatMmss';
import {
  LIVE_TIMER_BYOC_SECONDS,
  LIVE_TIMER_FALLBACK_SECONDS,
  liveTimerDefaultSeconds,
  liveTimerSeconds,
  readTimerSecondsOverride,
} from './liveTimerSeconds';

const byoc = {
  seed: { prompt: 'Conte um hobby seu.' },
  harness: { generation_prompt: 'Crie duas versões sobre {seed}.', interaction: 'pick_best' },
};

describe('liveTimerDefaultSeconds', () => {
  it('gives a code activity 5 minutes — writing code from scratch is not a 1-min task', () => {
    expect(liveTimerDefaultSeconds('code')).toBe(300);
  });

  it.each(['single_choice', 'multi_choice', 'match', 'order', 'quiz', 'sandbox_scenario'])(
    'keeps the legacy 60s default for %s',
    (kind) => {
      expect(liveTimerDefaultSeconds(kind)).toBe(60);
      expect(liveTimerDefaultSeconds(kind)).toBe(LIVE_TIMER_FALLBACK_SECONDS);
    }
  );

  it.each(['concept', 'video', 'document', 'diagram'])('gives no timer to content kind %s', (kind) => {
    expect(liveTimerDefaultSeconds(kind)).toBe(0);
  });

  it('gives no timer for a missing / unknown kind', () => {
    expect(liveTimerDefaultSeconds(null)).toBe(0);
    expect(liveTimerDefaultSeconds(undefined)).toBe(0);
    expect(liveTimerDefaultSeconds('')).toBe(0);
    expect(liveTimerDefaultSeconds('mystery')).toBe(0);
  });
});

describe('readTimerSecondsOverride', () => {
  it('reads a numeric timer_seconds', () => {
    expect(readTimerSecondsOverride({ timer_seconds: 480 })).toBe(480);
  });

  it('accepts a numeric string (authored jsonb is loose) and floors fractions', () => {
    expect(readTimerSecondsOverride({ timer_seconds: '420' })).toBe(420);
    expect(readTimerSecondsOverride({ timer_seconds: 90.7 })).toBe(90);
  });

  it.each([
    ['absent', {}],
    ['null', { timer_seconds: null }],
    ['zero', { timer_seconds: 0 }],
    ['negative', { timer_seconds: -30 }],
    ['NaN', { timer_seconds: Number.NaN }],
    ['Infinity', { timer_seconds: Number.POSITIVE_INFINITY }],
    ['non-numeric string', { timer_seconds: 'cinco minutos' }],
    ['empty string', { timer_seconds: '' }],
    ['boolean', { timer_seconds: true }],
    ['object', { timer_seconds: { seconds: 300 } }],
    ['out of range (> 1h)', { timer_seconds: 7200 }],
  ])('rejects %s', (_label, spec) => {
    expect(readTimerSecondsOverride(spec)).toBeNull();
  });

  it('rejects a non-object spec', () => {
    expect(readTimerSecondsOverride(undefined)).toBeNull();
    expect(readTimerSecondsOverride(null)).toBeNull();
    expect(readTimerSecondsOverride('300')).toBeNull();
    expect(readTimerSecondsOverride([300])).toBeNull();
  });
});

describe('liveTimerSeconds', () => {
  it('falls back to the per-kind default when the spec has no override', () => {
    expect(liveTimerSeconds('code', { language: 'tsx' })).toBe(300);
    expect(liveTimerSeconds('single_choice', { options: [] })).toBe(60);
    expect(liveTimerSeconds('code')).toBe(300);
    expect(liveTimerSeconds('single_choice')).toBe(60);
  });

  it('lets a valid spec.timer_seconds win over the default', () => {
    expect(liveTimerSeconds('code', { timer_seconds: 600 })).toBe(600);
    expect(liveTimerSeconds('single_choice', { timer_seconds: 30 })).toBe(30);
  });

  it('falls back to the default when the override is invalid', () => {
    expect(liveTimerSeconds('code', { timer_seconds: 'depende' })).toBe(300);
    expect(liveTimerSeconds('code', { timer_seconds: -1 })).toBe(300);
    expect(liveTimerSeconds('single_choice', { timer_seconds: null })).toBe(60);
  });

  it('never creates a timer for a content kind, even with an override', () => {
    expect(liveTimerSeconds('concept', { timer_seconds: 300 })).toBe(0);
    expect(liveTimerSeconds('video', { timer_seconds: 300 })).toBe(0);
    expect(liveTimerSeconds(undefined, { timer_seconds: 300 })).toBe(0);
  });

  it('gives a BYOC round room to generate, whatever kind it rides on', () => {
    expect(liveTimerSeconds('concept', { title: 'Contexto', byoc })).toBe(LIVE_TIMER_BYOC_SECONDS);
    expect(liveTimerSeconds('single_choice', { byoc })).toBe(LIVE_TIMER_BYOC_SECONDS);
    expect(LIVE_TIMER_BYOC_SECONDS).toBeGreaterThan(LIVE_TIMER_FALLBACK_SECONDS);
  });

  it('still lets the author override a BYOC round', () => {
    expect(liveTimerSeconds('concept', { byoc, timer_seconds: 240 })).toBe(240);
  });

  it('formats as a mm:ss label that survives durations over a minute', () => {
    // The button label is `live.timer.start` = 'Iniciar tempo ({time})'.
    expect(formatMmss(liveTimerSeconds('code'))).toBe('5:00');
    expect(formatMmss(liveTimerSeconds('single_choice'))).toBe('1:00');
    expect(formatMmss(liveTimerSeconds('code', { timer_seconds: 485 }))).toBe('8:05');
    expect(formatMmss(liveTimerSeconds('code', { timer_seconds: 3600 }))).toBe('60:00');
  });
});
