import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

/** Send the composed prompt, then wait for the typewriter stream to finish so the eval panel appears. */
async function send() {
  fireEvent.click(screen.getByTestId('sandbox-send'));
  await waitFor(() => expect(screen.getByTestId('sandbox-rate-ruim')).toBeInTheDocument(), { timeout: 5000 });
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
    expect(screen.queryByTestId('sandbox-continue')).not.toBeInTheDocument();
  });

  it('runs c1 to success and fires onComplete(true)', async () => {
    const onComplete = renderActivity(makeActivity(c1));

    // Step 1: send the base prompt as-is (weak answer).
    await send();
    // Step 2: rate the weak answer correctly → advances.
    fireEvent.click(screen.getByTestId('sandbox-rate-ruim'));
    // Step 3: add the context chip and send again (strong answer).
    fireEvent.click(screen.getByText(/redação de escola/i));
    await send();
    // Step 4: rate the strong answer correctly → flips `success` true.
    fireEvent.click(screen.getByTestId('sandbox-rate-top'));

    expect(screen.getByTestId('sandbox-reveal')).toBeInTheDocument();
    const cta = screen.getByTestId('sandbox-continue') as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    fireEvent.click(cta);
    expect(onComplete).toHaveBeenCalledWith(true);
  }, 15000);

  it('rejects a wrong rating with a critique + retry', async () => {
    renderActivity(makeActivity(c1));

    await send();
    // Mis-rate the weak answer as strong → rejected.
    fireEvent.click(screen.getByTestId('sandbox-rate-top'));
    expect(screen.getByTestId('sandbox-eval-wrong')).toBeInTheDocument();
    // Retry, then rate correctly → advances past the eval step.
    fireEvent.click(screen.getByTestId('sandbox-eval-retry'));
    fireEvent.click(screen.getByTestId('sandbox-rate-ruim'));
    expect(screen.queryByTestId('sandbox-eval-wrong')).not.toBeInTheDocument();
  }, 15000);

  // Regression lock (P5 clarification, plan 20260717-iterahq-activities-visual-ux-redesign):
  // the step indicator/composer MUST read off `scenario.steps.length` — never
  // hard-capped to 2. The instance-data migration to 2-step specs is a
  // SEPARATE track; this component must keep rendering whatever step count
  // the spec actually has, both before and after that migration lands.
  it('step indicator is DATA-DRIVEN off scenario.steps.length — never hard-capped (4-step fixture reads "1/4")', () => {
    renderActivity(makeActivity(c1)); // c1 fixture has 4 steps
    expect(screen.getByTestId('sandbox-instruction').textContent).toContain('1/4');
  });

  it('a 2-step spec (post-migration shape) reads "1/2" — same component, no code change needed', () => {
    const twoStep = { ...c1, steps: (c1.steps as unknown[]).slice(0, 2) };
    renderActivity(makeActivity(twoStep));
    expect(screen.getByTestId('sandbox-instruction').textContent).toContain('1/2');
  });
});
