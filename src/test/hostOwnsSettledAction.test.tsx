/**
 * When a host owns the settled action (the lesson player's "Continuar"), no
 * contract fixture may keep a dead action button of its own once `done`.
 */
import './storybookTestBridge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { HostOwnsSettledAction } from '@iterahq/activities';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { ActivityKind } from '@/types/content';
import { makeActivity } from '@/stories/activityFixtures';
import { ACTIVITY_CONTRACTS, type ContractKey } from '@/stories/contractFixtures';

const DEAD_BUTTONS = [
  'activity-done',
  'code-submit',
  'guided-submit',
  'single-choice-submit',
  'multi-choice-submit',
  'quiz-submit',
  'match-submit',
  'order-submit',
  'question-submit',
  'byoc-submit',
  'judge-submit',
];

const KEYS = Object.keys(ACTIVITY_CONTRACTS) as ContractKey[];

afterEach(cleanup);

describe('HostOwnsSettledAction', () => {
  it.each(KEYS)('%s: a done activity renders no dead action button', (key) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const contract = ACTIVITY_CONTRACTS[key];
    const activity = makeActivity(
      contract.kind as ActivityKind,
      contract.spec as Record<string, unknown>,
      'done',
      (contract as { rubric?: Record<string, unknown> }).rubric ?? null,
    );
    const { container } = render(
      <I18nProvider>
        <HostOwnsSettledAction>
          <ActivityRenderer activity={activity} onComplete={vi.fn()} />
        </HostOwnsSettledAction>
      </I18nProvider>,
    );
    for (const id of DEAD_BUTTONS) {
      expect(container.querySelector(`[data-testid="${id}"]`), id).toBeNull();
    }
  });
});
