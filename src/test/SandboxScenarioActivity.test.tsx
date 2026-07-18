import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { safeParseActivitySpec } from '@iterahq/activity-spec';
import { I18nProvider } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { Activity } from '@/types/content';
import scenarios from './fixtures/sandbox-scenarios.json';

/**
 * sandbox_scenario. `SandboxScenarioActivity` is a thin dispatcher (PR
 * "Split sandbox_scenario into three activity types") that picks the concrete
 * component off the scenario's authoring shape: `slots` → SandboxAICompleteWords
 * (c2/c5/c6), `choices` → SandboxAIWithOptions (c1/c3/c4), neither → SandboxAI
 * (cIA). A sandbox activity is ALWAYS exactly 2 steps (compose, evaluate) — the
 * fixtures were migrated off the old 4-step (two compose→evaluate rounds)
 * shape, matching the prod content migration; for the choices/slots variants
 * the KEPT round is the one that actually exercises the chip/slot mechanic
 * (the plain "no context" baseline round is dropped — the dedicated `cIA`
 * fixture already covers "no context" for the `ai` variant).
 *
 * Also asserts: the composer NEVER starts pre-filled with the scenario's fixed
 * `basePrompt` — Tainan: "sempre o usuário tem que inserir". For the `ai`
 * variant (no choices/slots) the base prompt shows up as a seed chip below the
 * window; for `options`/`words` variants the composed preview stays hidden
 * until the learner has picked a choice / filled a slot.
 */
const c1 = (scenarios as Record<string, unknown>).c1 as Record<string, unknown>; // options variant (choices)
const c2 = (scenarios as Record<string, unknown>).c2 as Record<string, unknown>; // words variant (slots)
const cIA = (scenarios as Record<string, unknown>).cIA as Record<string, unknown>; // ai variant (pure seed)

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

/** Wait for the typewriter stream to finish so the eval panel appears. */
async function waitForEvalPanel() {
  await waitFor(() => expect(screen.getByTestId('sandbox-rate-ruim')).toBeInTheDocument(), { timeout: 5000 });
}

describe('SandboxScenarioActivity dispatcher', () => {
  it('the shared schema accepts valid scenarios (each authoring shape) and rejects a broken one', () => {
    expect(safeParseActivitySpec('sandbox_scenario', c1).success).toBe(true);
    expect(safeParseActivitySpec('sandbox_scenario', c2).success).toBe(true);
    expect(safeParseActivitySpec('sandbox_scenario', cIA).success).toBe(true);
    expect(safeParseActivitySpec('sandbox_scenario', { id: 'x' }).success).toBe(false);
  });

  it('renders an invalid spec as a friendly fallback (no crash)', () => {
    renderActivity(makeActivity({ id: 'broken' }));
    expect(screen.getByTestId('sandbox-invalid')).toBeInTheDocument();
  });

  it('dispatches to the sandbox shell and does NOT emit its verdict until success (options variant, c1)', () => {
    const onComplete = renderActivity(makeActivity(c1));
    expect(screen.getByTestId('activity-shell').getAttribute('data-activity-kind')).toBe('sandbox_scenario');
    // The terminal "Continuar" moved to the shell/harness fixed footer — it is
    // never rendered inside the activity — and the verdict is emitted UP only
    // once the learner has actually succeeded.
    expect(screen.queryByTestId('sandbox-continue')).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  // Every scenario is now exactly 2 steps regardless of authoring shape.
  it.each([
    ['ai (cIA)', cIA],
    ['options (c1)', c1],
    ['words (c2)', c2],
  ])('step indicator reads "1/2" for the %s variant', (_label, spec) => {
    renderActivity(makeActivity(spec));
    expect(screen.getByTestId('sandbox-instruction').textContent).toContain('1/2');
  });

  describe('ai variant (no choices/slots) — the seed chip', () => {
    // Tainan: "sempre o usuário tem que inserir" — the composer must NEVER
    // start pre-filled with the step's fixed basePrompt. It shows up as a chip
    // BELOW the sandbox window instead; clicking the chip is what inserts it
    // into the (previously empty) composer.
    it('composer starts EMPTY — the seed/base prompt is a chip, not pre-filled text', () => {
      renderActivity(makeActivity(cIA));

      // Empty means the placeholder shows, NOT the fixed basePrompt text.
      expect(screen.getByTestId('sandbox-input-preview').textContent).toMatch(/escreva seu pedido/i);
      expect((screen.getByTestId('sandbox-send') as HTMLButtonElement).disabled).toBe(true);

      const seedChip = screen.getByTestId('sandbox-seed-chip');
      fireEvent.click(seedChip);

      expect(screen.getByTestId('sandbox-input-preview').textContent).not.toBe('');
      expect((screen.getByTestId('sandbox-send') as HTMLButtonElement).disabled).toBe(false);
    });

    it('runs cIA to success (click seed chip → send → rate) and emits onComplete(true) UP for the footer', async () => {
      const onComplete = renderActivity(makeActivity(cIA));

      fireEvent.click(screen.getByTestId('sandbox-seed-chip'));
      fireEvent.click(screen.getByTestId('sandbox-send'));
      await waitForEvalPanel();
      // cIA's fallback canned result is quality "top" — correct rating is "forte".
      fireEvent.click(screen.getByTestId('sandbox-rate-top'));

      expect(screen.getByTestId('sandbox-reveal')).toBeInTheDocument();
      // No in-window CTA any more — the settled verdict is emitted UP (with the
      // reveal recap as the footer explanation) for the shell/harness footer.
      await waitFor(() =>
        expect(onComplete).toHaveBeenCalledWith(true, expect.objectContaining({ explanation: expect.any(String) })),
      );
      expect(screen.queryByTestId('sandbox-continue')).not.toBeInTheDocument();
    }, 15000);
  });

  describe('options variant (c1) — choice chips', () => {
    // Same pre-fill rule applies to a step that exposes choices: the composed
    // preview (base prompt + pick) must stay hidden until the learner has
    // actually picked a chip — not appear the instant the step mounts.
    it('composer starts EMPTY until a choice chip is picked', () => {
      renderActivity(makeActivity(c1));

      expect(screen.getByTestId('sandbox-input-preview').textContent).toMatch(/escreva seu pedido/i);
      expect((screen.getByTestId('sandbox-send') as HTMLButtonElement).disabled).toBe(true);
      expect(screen.queryByTestId('sandbox-seed-chip')).not.toBeInTheDocument();

      fireEvent.click(screen.getByText(/redação de escola/i));

      expect(screen.getByTestId('sandbox-input-preview').textContent).not.toBe('');
      expect((screen.getByTestId('sandbox-send') as HTMLButtonElement).disabled).toBe(false);
    });

    it('choice chips render emoji-free', () => {
      renderActivity(makeActivity(c1));
      const chips = screen.getByTestId('sandbox-choices');
      expect(chips.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    });

    it('runs c1 to success (pick the right chip → send → rate) and emits onComplete(true) UP for the footer', async () => {
      const onComplete = renderActivity(makeActivity(c1));

      // Only "add-especifico" actually helps (top quality); the other two are distractors.
      fireEvent.click(screen.getByText(/redação de escola/i));
      fireEvent.click(screen.getByTestId('sandbox-send'));
      await waitForEvalPanel();
      fireEvent.click(screen.getByTestId('sandbox-rate-top'));

      expect(screen.getByTestId('sandbox-reveal')).toBeInTheDocument();
      await waitFor(() =>
        expect(onComplete).toHaveBeenCalledWith(true, expect.objectContaining({ explanation: expect.any(String) })),
      );
      expect(screen.queryByTestId('sandbox-continue')).not.toBeInTheDocument();
    }, 15000);

    it('rejects a wrong rating with a critique + retry', async () => {
      renderActivity(makeActivity(c1));

      fireEvent.click(screen.getByText(/redação de escola/i));
      fireEvent.click(screen.getByTestId('sandbox-send'));
      await waitForEvalPanel();
      // Mis-rate the strong answer as weak → rejected.
      fireEvent.click(screen.getByTestId('sandbox-rate-ruim'));
      expect(screen.getByTestId('sandbox-eval-wrong')).toBeInTheDocument();
      // Retry, then rate correctly → advances past the eval step.
      fireEvent.click(screen.getByTestId('sandbox-eval-retry'));
      fireEvent.click(screen.getByTestId('sandbox-rate-top'));
      expect(screen.queryByTestId('sandbox-eval-wrong')).not.toBeInTheDocument();
    }, 15000);
  });

  describe('words variant (c2) — slot panel', () => {
    it('composer starts EMPTY until the slot is filled', () => {
      renderActivity(makeActivity(c2));

      expect(screen.getByTestId('sandbox-input-preview').textContent).toMatch(/escreva seu pedido/i);
      expect((screen.getByTestId('sandbox-send') as HTMLButtonElement).disabled).toBe(true);

      fireEvent.click(screen.getByText(/meu irmão pequeno/i));

      expect(screen.getByTestId('sandbox-input-preview').textContent).not.toBe('');
      expect((screen.getByTestId('sandbox-send') as HTMLButtonElement).disabled).toBe(false);
    });

    it('runs c2 to success (fill the slot → send → rate) and emits onComplete(true) UP for the footer', async () => {
      const onComplete = renderActivity(makeActivity(c2));

      fireEvent.click(screen.getByText(/meu irmão pequeno/i));
      fireEvent.click(screen.getByTestId('sandbox-send'));
      await waitForEvalPanel();
      fireEvent.click(screen.getByTestId('sandbox-rate-top'));

      expect(screen.getByTestId('sandbox-reveal')).toBeInTheDocument();
      await waitFor(() =>
        expect(onComplete).toHaveBeenCalledWith(true, expect.objectContaining({ explanation: expect.any(String) })),
      );
      expect(screen.queryByTestId('sandbox-continue')).not.toBeInTheDocument();
    }, 15000);
  });

  // Regression lock (P5 clarification, plan 20260717-iterahq-activities-visual-ux-redesign):
  // the step indicator/composer MUST read off `scenario.steps.length` — never
  // hard-capped to 2, independent of whatever shape a given fixture has.
  it('step indicator is DATA-DRIVEN off scenario.steps.length — never hard-capped (a synthetic 4-step spec reads "1/4")', () => {
    const fourStep = {
      ...cIA,
      steps: [
        ...(cIA.steps as Record<string, unknown>[]),
        { ...(cIA.steps as Record<string, unknown>[])[0], id: 'rodar-2' },
        { ...(cIA.steps as Record<string, unknown>[])[1], id: 'avaliar-2' },
      ],
    };
    renderActivity(makeActivity(fourStep));
    expect(screen.getByTestId('sandbox-instruction').textContent).toContain('1/4');
  });
});
