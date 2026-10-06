/**
 * Controls drawn under 44 px keep their drawing and get a 44 px hit area under a
 * finger: a `coarse:before:` pseudo-element, or `touch-hit` for a text link.
 */
import './storybookTestBridge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { ActivityKind } from '@/types/content';
import { makeActivity } from '@/stories/activityFixtures';
import { ACTIVITY_CONTRACTS, type ContractFixture } from '@/stories/contractFixtures';

const HIT_AREA = /coarse:before:|touch-hit|coarse:min-h-11/;

const CONTROLS: Partial<Record<ActivityKind, string>> = {
  order: '[data-testid="order-up"], [data-testid="order-down"]',
  arrange: '[data-testid^="arrange-up-"], [data-testid^="arrange-down-"]',
  selector: '[data-testid^="selector-option-"]',
  query: '[data-testid^="query-clause-"]',
  press: '[data-testid^="press-option-"]',
  bucket: '[data-testid^="bucket-chip-"]',
  compose_blocks: '[data-testid^="compose-block-"]',
  inspect: '[data-testid="inspect-page-target"]',
};

afterEach(cleanup);

describe('hit areas under a finger', () => {
  const contracts = (Object.entries(ACTIVITY_CONTRACTS) as [string, ContractFixture][]).filter(([, c]) => c.kind in CONTROLS);

  it.each(contracts)('%s gives every control a 44 px hit area', (_key, contract) => {
    const { container } = render(
      <I18nProvider>
        <ActivityRenderer activity={makeActivity(contract.kind, contract.spec, undefined, contract.rubric ?? null)} onComplete={vi.fn()} />
      </I18nProvider>,
    );
    const controls = [...container.querySelectorAll(CONTROLS[contract.kind]!)];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) expect(control.className).toMatch(HIT_AREA);
  });

  it('keeps the dense code side of inspect at its drawn size', () => {
    const contract = (Object.values(ACTIVITY_CONTRACTS) as ContractFixture[]).find((c) => c.kind === 'inspect')!;
    const { container } = render(
      <I18nProvider>
        <ActivityRenderer activity={makeActivity('inspect', contract.spec, undefined, contract.rubric ?? null)} onComplete={vi.fn()} />
      </I18nProvider>,
    );
    for (const control of container.querySelectorAll('[data-testid="inspect-code-target"]')) {
      expect(control.className).not.toMatch(HIT_AREA);
    }
  });
});
