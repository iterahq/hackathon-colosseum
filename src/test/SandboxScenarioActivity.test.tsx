import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { safeParseActivitySpec } from '@iterahq/activity-spec';
import { I18nProvider } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { Activity } from '@/types/content';
import scenarios from './fixtures/sandbox-scenarios.json';

/**
 * sandbox_scenario. Drives the real `@iterahq/activity-spec/runtime` through
 * scenario c1 ("the vague ask") to success on the compose→evaluate pedagogy:
 * send the base prompt, RATE the weak answer, add context, send again, RATE the
 * strong answer. Asserts the branded chat dispatches, the CTA is gated until
 * success, the reveal shows, and onComplete(true) fires. Also asserts the shared
 * per-kind schema accepts c1 and rejects a broken spec.
 */
const c1 = (scenarios as Record<string, unknown>).c1 as Record<string, unknown>;

function makeActivity(spec: Record<string, unknown>): Activity {
  return { id: 't-sandbox', lessonId: 'l', ordinal: 0, kind: 'sandbox_scenario', spec, rubric: null };
}

function renderActivity(activity: Activity, onComplete = vi.fn()) {
  render(
    <I18nProvider>
      <ActivityRenderer activity={activity} onComplete={onComplete} />
    </I18nProvider>,
  );
  return onComplete;
}

describe('SandboxScenarioActivity', () => {
  it('the shared schema accepts a valid scenario and rejects a broken one', () => {
    expect(safeParseActivitySpec('sandbox_scenario', c1).success).toBe(true);
    expect(safeParseActivitySpec('sandbox_scenario', { id: 'x' }).success).toBe(false);
  });

  it('renders an invalid spec as a friendly fallback (no crash)', () => {
    renderActivity(makeActivity({ id: 'broken' }));
    expect(screen.getByTestId('sandbox-invalid')).toBeInTheDocument();
  });

  it('dispatches to the sandbox shell and gates "Continuar" until success', () => {
    renderActivity(makeActivity(c1));
    expect(screen.getByTestId('activity-shell').getAttribute('data-activity-kind')).toBe('sandbox_scenario');
    expect((screen.getByTestId('sandbox-continue') as HTMLButtonElement).disabled).toBe(true);
  });

  it('runs c1 to success and fires onComplete(true)', () => {
    const onComplete = renderActivity(makeActivity(c1));

    // Step 1: send the base prompt as-is (weak answer).
    fireEvent.click(screen.getByTestId('sandbox-send'));
    // Step 2: rate the weak answer correctly → advances.
    fireEvent.click(screen.getByTestId('sandbox-rate-ruim'));
    // Step 3: add the context chip and send again (strong answer).
    fireEvent.click(screen.getByText(/redação de escola/i));
    fireEvent.click(screen.getByTestId('sandbox-send'));
    // Step 4: rate the strong answer correctly → flips `success` true.
    fireEvent.click(screen.getByTestId('sandbox-rate-top'));

    expect(screen.getByTestId('sandbox-reveal')).toBeInTheDocument();
    const cta = screen.getByTestId('sandbox-continue') as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    fireEvent.click(cta);
    expect(onComplete).toHaveBeenCalledWith(true);
  });

  it('rejects a wrong rating with a critique + retry', () => {
    renderActivity(makeActivity(c1));

    fireEvent.click(screen.getByTestId('sandbox-send'));
    // Mis-rate the weak answer as strong → rejected.
    fireEvent.click(screen.getByTestId('sandbox-rate-top'));
    expect(screen.getByTestId('sandbox-eval-wrong')).toBeInTheDocument();
    // Retry, then rate correctly → advances past the eval step.
    fireEvent.click(screen.getByTestId('sandbox-eval-retry'));
    fireEvent.click(screen.getByTestId('sandbox-rate-ruim'));
    expect(screen.queryByTestId('sandbox-eval-wrong')).not.toBeInTheDocument();
  });
});
