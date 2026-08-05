import { describe, it, expect } from 'vitest';
import { resources } from '@/i18n';
import {
  BYOC_STAGE_KEYS,
  byocProgress,
} from '@/components/branded/activity/byoc/byocProgress';

describe('byocProgress', () => {
  // `t()` falls back to the raw key, so a missing translation ships as
  // `byoc.stage.reading` on screen instead of failing anywhere.
  it('has every stage translated in both locales', () => {
    for (const key of BYOC_STAGE_KEYS) {
      expect(resources.pt[key], `pt: ${key}`).toBeTruthy();
      expect(resources.en[key], `en: ${key}`).toBeTruthy();
    }
  });

  it('never claims to be finished', () => {
    for (const ms of [0, 30_000, 75_000, 600_000]) {
      expect(byocProgress(ms).percent).toBeLessThanOrEqual(93);
    }
  });

  it('only ever moves forward', () => {
    let last = -1;
    for (let ms = 0; ms <= 120_000; ms += 1_000) {
      const { percent } = byocProgress(ms);
      expect(percent).toBeGreaterThanOrEqual(last);
      last = percent;
    }
  });

  it('walks the stages at the measured boundaries', () => {
    expect(byocProgress(0).stage).toBe(0);
    expect(byocProgress(1_499).stage).toBe(0);
    expect(byocProgress(1_500).stage).toBe(1);
    expect(byocProgress(3_000).stage).toBe(2);
    expect(byocProgress(4_500).stage).toBe(3);
    expect(byocProgress(600_000).stage).toBe(BYOC_STAGE_KEYS.length - 1);
  });

  // O aluno tem que ATRAVESSAR as quatro etapas na latência que a produção tem
  // hoje (~6s ponta a ponta, itera-api#37). Contra os limites antigos, calibrados
  // pro modelo de raciocínio que já saiu, ele parava na primeira e as outras três
  // eram string traduzida e inalcançável — este teste é o que impede a recaída.
  it('reaches the last stage within the measured end-to-end wait', () => {
    expect(byocProgress(6_000).stage).toBe(BYOC_STAGE_KEYS.length - 1);
  });

  it('clamps a clock that ran backwards', () => {
    expect(byocProgress(-5_000)).toEqual(byocProgress(0));
  });
});
