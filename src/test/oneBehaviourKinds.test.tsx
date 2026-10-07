/**
 * The ONE-BEHAVIOUR kinds, rendered (plan `20260924-activity-type-one-behavior-rule`,
 * T9–T14, and T25 for `chat_rate_reply`).
 *
 * `activityInvariant.test.tsx` proves every kind MOUNTS and reaches its verdict;
 * `activityKindValidationCoverage.test.tsx` proves every kind degrades to the
 * invalid-spec card. This file proves the part that is the rule itself:
 *
 *  1. THE KIND PICKS THE SURFACE, NOT THE SPEC. A spec that carries another
 *     behaviour's shape is the invalid-spec card — never the other screen.
 *  2. THE KIND PINS THE INPUT. A terminal step with no `optionGranularity`
 *     still shows tokens under `terminal_build_command`; a question kind shows
 *     no "Outro" and no notes box it did not ask for.
 *  3. NO HOST-DEPENDENT BEHAVIOUR. `document_ai_judge` with no judge port and
 *     the `byoc_*` kinds with no itera-api show an explicit state, never the
 *     reflection or the host `concept` card.
 *  4. `chat_rate_reply` (T25) shows the author's fallback reply and the rate
 *     panel BEFORE any send, and completes on the right rating.
 */
import './storybookTestBridge';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const apiConfigured = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/api/iteraApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/iteraApi')>()),
  iteraApiConfigured: () => apiConfigured(),
}));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ session: null, loading: false }) }));
// The BYOC generation runtime talks to the itera-api. What this file asserts is
// WHICH interaction the kind hands to it, so the view is a stub that says so.
vi.mock('@/components/branded/activity/byoc/ByocActivity', () => ({
  ByocActivity: ({ spec }: { spec: { harness: { interaction: string } } }) => (
    <div data-testid="byoc-activity" data-interaction={spec.harness.interaction} />
  ),
}));

import { ActivityProvider, ONE_BEHAVIOUR_KINDS, transitionKindOf } from '@iterahq/activities';
import type { ActivityApiPort, ActivityEvent } from '@iterahq/activities';
import { I18nProvider, useI18n } from '@/i18n';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import type { Activity, ActivityKind } from '@/types/content';
import { makeActivity } from '@/stories/activityFixtures';
import {
  BYOC_PICK_BEST_KIND_SPEC,
  CHAT_COMPOSE_SPEC,
  CHAT_FILL_SELECT_SPEC,
  CHAT_RATE_REPLY_SPEC,
  CODE_EDITOR_CHECKS_SPEC,
  CODE_FILL_BANK_SPEC,
  CODE_FILL_SELECT_SPEC,
  DOCUMENT_AI_JUDGE_KIND_SPEC,
  DOCUMENT_READING_SPEC,
  DOCUMENT_REFLECT_SPEC,
  QUESTION_PICK_MANY_SPEC,
  QUESTION_PICK_ONE_SPEC,
  QUESTION_WRITE_SPEC,
  TERMINAL_BUILD_COMMAND_SPEC,
  TERMINAL_PICK_COMMAND_SPEC,
  TERMINAL_TYPE_COMMAND_SPEC,
} from '@/stories/contractFixtures';
import { BYOC_JUDGE_EACH_SPEC } from '@/stories/byocFixtures';
import { rateSeededReply } from '@/stories/interactions';
import { isFooterGradedKind } from '@/components/branded/activity/activityFeedbackKinds';
import {
  activityHasRevealableAnswer,
  canReopenSubmission,
  hasRevealableAnswer,
  isAnswerableLiveKind,
} from '@/utils/isAnswerableLiveKind';
import { isExerciseActivity } from '@/utils/isExerciseActivity';
import { isScenarioKind } from '@/utils/activityFamilies';
import { KIND_ARTIFACT_DEFAULTS } from '@/services/artifactPolicy';

afterEach(() => {
  cleanup();
  apiConfigured.mockReturnValue(false);
  localStorage.clear();
});

function Host({
  api,
  onEvent,
  children,
}: {
  api?: ActivityApiPort;
  onEvent?: (e: ActivityEvent) => void;
  children: ReactNode;
}) {
  const i18n = useI18n();
  return (
    <ActivityProvider i18n={i18n} api={api} onEvent={onEvent} identity={{ authenticated: true }}>
      {children}
    </ActivityProvider>
  );
}

function mount(
  activity: Activity,
  opts: { api?: ActivityApiPort; onEvent?: (e: ActivityEvent) => void; onComplete?: () => void } = {},
) {
  const onComplete = opts.onComplete ?? vi.fn();
  const view = render(
    <I18nProvider>
      <Host api={opts.api} onEvent={opts.onEvent}>
        <ActivityRenderer activity={activity} onComplete={onComplete} />
      </Host>
    </I18nProvider>,
  );
  return { ...view, onComplete };
}

const kindActivity = (kind: string, spec: unknown, rubric: Record<string, unknown> | null = null) =>
  makeActivity(kind as ActivityKind, spec as Record<string, unknown>, undefined, rubric);

const invalidCard = (kind: string) => screen.queryByTestId(`${kind.replace(/_/g, '-')}-invalid`);

/* ─────────────────────────────── code (T9) ──────────────────────────────── */

describe('code — the kind names the surface', () => {
  it('code_fill_bank draws the chip bank and no dropdown', () => {
    mount(kindActivity('code_fill_bank', CODE_FILL_BANK_SPEC));
    expect(screen.getAllByTestId('guided-bank-chip').length).toBeGreaterThan(0);
    for (const blank of screen.getAllByTestId(/^guided-blank-/)) {
      expect(blank.getAttribute('data-blank-kind')).toBe('bank');
    }
  });

  it('code_fill_bank REFUSES a spec with a dropdown blank — the card, not the mixed screen', () => {
    const mixed = {
      ...CODE_FILL_BANK_SPEC,
      blanks: [CODE_FILL_BANK_SPEC.blanks[0], CODE_FILL_SELECT_SPEC.blanks[1]],
    };
    mount(kindActivity('code_fill_bank', mixed));
    expect(invalidCard('code_fill_bank')).not.toBeNull();
    expect(screen.queryByTestId('guided-bank-chip')).toBeNull();
  });

  it('code_fill_select draws only dropdown blanks', () => {
    mount(kindActivity('code_fill_select', CODE_FILL_SELECT_SPEC));
    const blanks = screen.getAllByTestId(/^guided-blank-/);
    expect(blanks.length).toBe(2);
    for (const blank of blanks) expect(blank.getAttribute('data-blank-kind')).toBe('select');
  });

  it('code_editor_checks is the open editor, and REFUSES a guided spec instead of drawing it', () => {
    mount(kindActivity('code_editor_checks', CODE_EDITOR_CHECKS_SPEC));
    expect(screen.queryAllByTestId(/^guided-blank-/)).toHaveLength(0);
    expect(document.querySelector('[data-activity-kind="code_editor_checks"]')).not.toBeNull();
    cleanup();

    mount(kindActivity('code_editor_checks', CODE_FILL_BANK_SPEC));
    expect(invalidCard('code_editor_checks')).not.toBeNull();
    expect(screen.queryAllByTestId(/^guided-blank-/)).toHaveLength(0);
  });

  it('code_editor_ungraded REFUSES checks — a graded editor is the other kind', () => {
    mount(kindActivity('code_editor_ungraded', CODE_EDITOR_CHECKS_SPEC));
    expect(invalidCard('code_editor_ungraded')).not.toBeNull();
  });
});

/* ─────────────────────────────── chat (T10 + T25) ───────────────────────── */

describe('chat — the kind names the compose panel', () => {
  it('chat_fill_select draws the slot options and no context chips', () => {
    mount(kindActivity('chat_fill_select', CHAT_FILL_SELECT_SPEC));
    expect(screen.getByTestId('sandbox-slots')).toBeInTheDocument();
    expect(screen.queryByTestId('sandbox-seed-chip')).toBeNull();
  });

  it('chat_compose REFUSES a spec with slots instead of drawing the slot panel', () => {
    mount(kindActivity('chat_compose', { ...CHAT_COMPOSE_SPEC, slots: CHAT_FILL_SELECT_SPEC.slots }));
    expect(invalidCard('chat_compose')).not.toBeNull();
    expect(screen.queryByTestId('sandbox-slots')).toBeNull();
  });

  it('chat_compose REFUSES an `evaluate` step — compose and evaluate never mix (ADR-3)', () => {
    const steps = [
      ...(CHAT_COMPOSE_SPEC.steps as unknown[]),
      { id: 'avaliar', mode: 'evaluate', prompt: { pt: 'E aí?' }, unlock: { evaluated: { correct: true } } },
    ];
    mount(kindActivity('chat_compose', { ...CHAT_COMPOSE_SPEC, steps }));
    expect(invalidCard('chat_compose')).not.toBeNull();
  });
});

describe('chat_rate_reply — the seeded fallback run (T25)', () => {
  const rateActivity = () => kindActivity('chat_rate_reply', CHAT_RATE_REPLY_SPEC);
  const fallbackReply = () => {
    const state = CHAT_RATE_REPLY_SPEC.initialState as {
      cannedResults: Record<string, { text: { pt: string } }>;
      resultResolver: { fallback: string };
    };
    return state.cannedResults[state.resultResolver.fallback].text.pt;
  };

  it('shows the fallback reply and the rate panel BEFORE any send, with no compose input', async () => {
    const { container } = mount(rateActivity());
    // No composer at all: the learner never sends in this kind.
    expect(screen.queryByTestId('sandbox-send')).toBeNull();
    expect(screen.queryByTestId('sandbox-seed-chip')).toBeNull();
    // The rate panel comes up by itself, over the seeded reply.
    const panel = await within(container).findByTestId('sandbox-eval', undefined, { timeout: 8000 });
    expect(panel).toBeInTheDocument();
    await waitFor(() => expect(container.textContent).toContain(fallbackReply()), { timeout: 8000 });
  }, 20000);

  it('the wrong rating is rejected with no verdict; the right one completes', async () => {
    const onComplete = vi.fn();
    const { container } = mount(rateActivity(), { onComplete });
    await rateSeededReply(container, 'top');
    expect(screen.getByTestId('sandbox-eval-wrong')).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('sandbox-eval-retry'));
    await rateSeededReply(container, 'ruim');
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(onComplete.mock.calls[0][0]).toBe(true);
  }, 20000);
});

/* ───────────────────────────── terminal (T11) ───────────────────────────── */

describe('terminal — the kind pins the input', () => {
  /** The production build spec with every per-step `optionGranularity` removed. */
  const buildWithoutGranularity = () => {
    const spec = structuredClone(TERMINAL_BUILD_COMMAND_SPEC) as {
      steps: { expose?: Record<string, unknown> }[];
    };
    for (const step of spec.steps) delete step.expose?.optionGranularity;
    return spec;
  };

  it('terminal_build_command shows TOKENS even when the step does not say `token`', () => {
    // Under `terminal_sandbox` the default granularity is `command`, so the
    // same spec would be a command palette there. The KIND decides here.
    mount(kindActivity('terminal_build_command', buildWithoutGranularity()));
    expect(screen.getAllByTestId('terminal-option-token').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('terminal-option-command')).toBeNull();
  });

  it('terminal_pick_command shows whole commands, and REFUSES a token step', () => {
    mount(kindActivity('terminal_pick_command', TERMINAL_PICK_COMMAND_SPEC));
    expect(screen.getAllByTestId('terminal-option-command').length).toBeGreaterThan(0);
    cleanup();

    mount(kindActivity('terminal_pick_command', TERMINAL_BUILD_COMMAND_SPEC));
    expect(invalidCard('terminal_pick_command')).not.toBeNull();
  });

  it('terminal_type_command has no palette, and REFUSES `inputMode: options`', () => {
    mount(kindActivity('terminal_type_command', TERMINAL_TYPE_COMMAND_SPEC));
    expect(screen.queryByTestId('terminal-option-command')).toBeNull();
    expect(screen.queryByTestId('terminal-option-token')).toBeNull();
    expect(document.querySelector('[data-input-mode="freeText"]')).not.toBeNull();
    cleanup();

    mount(kindActivity('terminal_type_command', { ...TERMINAL_TYPE_COMMAND_SPEC, inputMode: 'options' }));
    expect(invalidCard('terminal_type_command')).not.toBeNull();
  });
});

/* ───────────────────────────── document (T12) ───────────────────────────── */

describe('document — the kind names the judge; no host-dependent behaviour', () => {
  it('document_ai_judge WITHOUT a judge port shows the explicit unavailable state — never the reflection', () => {
    const events: ActivityEvent[] = [];
    mount(kindActivity('document_ai_judge', DOCUMENT_AI_JUDGE_KIND_SPEC, { mode: 'ai-judge' }), {
      onEvent: (e) => events.push(e),
    });
    expect(screen.getByTestId('document-ai-judge-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('document-reflection-input')).toBeNull();
    expect(screen.queryByTestId('activity-done')).toBeNull();
    expect(events.some((e) => e.type === 'port.unavailable')).toBe(true);
  });

  it('document_ai_judge WITH a judge port shows the judge surface', () => {
    mount(kindActivity('document_ai_judge', DOCUMENT_AI_JUDGE_KIND_SPEC, { mode: 'ai-judge' }), {
      api: { judge: vi.fn(), listSeeds: vi.fn().mockResolvedValue([]) },
    });
    expect(screen.getByTestId('judge-submit')).toBeInTheDocument();
    expect(screen.queryByTestId('document-ai-judge-unavailable')).toBeNull();
  });

  it('document_reflect reads its floor from `spec.evaluation` and gates the submit on it', () => {
    mount(kindActivity('document_reflect', DOCUMENT_REFLECT_SPEC));
    expect(screen.getByTestId('document-min-words').textContent).toContain('30');
    expect(screen.getByTestId('activity-done')).toBeDisabled();
  });

  it('document_reflect falls back to `rubric.min_words` — the transition source of production rows', () => {
    mount(kindActivity('document_reflect', DOCUMENT_READING_SPEC, { min_words: 12 }));
    expect(screen.getByTestId('document-min-words').textContent).toContain('12');
  });

  it('document_read has nothing to do: no textarea, no done button', () => {
    mount(kindActivity('document_read', DOCUMENT_READING_SPEC));
    expect(screen.getByTestId('document-prompt')).toBeInTheDocument();
    expect(screen.queryByTestId('document-reflection-input')).toBeNull();
    expect(screen.queryByTestId('activity-done')).toBeNull();
  });

  it('document_read REFUSES an evaluation — a graded document is another kind', () => {
    mount(kindActivity('document_read', DOCUMENT_REFLECT_SPEC));
    expect(invalidCard('document_read')).not.toBeNull();
  });
});

/* ───────────────────────────── byoc (T13) ───────────────────────────────── */

describe('byoc — three kinds, not a layer', () => {
  it('with no itera-api the kind shows `byoc-unavailable`, never the host concept card', () => {
    mount(kindActivity('byoc_pick_best', BYOC_PICK_BEST_KIND_SPEC));
    expect(screen.getByTestId('byoc-unavailable')).toBeInTheDocument();
    expect(document.querySelector('[data-activity-kind="concept"]')).toBeNull();
  });

  it('with the api, the kind hands ITS interaction to the BYOC runtime', () => {
    apiConfigured.mockReturnValue(true);
    mount(kindActivity('byoc_pick_best', BYOC_PICK_BEST_KIND_SPEC));
    expect(screen.getByTestId('byoc-activity').getAttribute('data-interaction')).toBe('pick_best');
  });

  it('a harness of ANOTHER interaction is the invalid-spec card, not the other interaction', () => {
    apiConfigured.mockReturnValue(true);
    mount(kindActivity('byoc_pick_best', { ...BYOC_PICK_BEST_KIND_SPEC, byoc: BYOC_JUDGE_EACH_SPEC }));
    expect(invalidCard('byoc_pick_best')).not.toBeNull();
    expect(screen.queryByTestId('byoc-activity')).toBeNull();
  });
});

/* ───────────────────────────── question (T14) ───────────────────────────── */

describe('question — the kind pins the input; no "Outro" on a pick kind (ADR-9)', () => {
  it('question_pick_one: options only, and a second pick REPLACES the first', async () => {
    mount(kindActivity('question_pick_one', QUESTION_PICK_ONE_SPEC));
    expect(screen.queryByTestId('question-other')).toBeNull();
    expect(screen.queryByTestId('question-text')).toBeNull();
    const [a, b] = screen.getAllByTestId('question-option');
    await userEvent.click(a);
    await userEvent.click(b);
    const selected = screen.getAllByTestId('question-option').filter((o) => o.getAttribute('data-selected') === 'true');
    expect(selected).toEqual([b]);
  });

  it('question_pick_many: options only, and picks ACCUMULATE', async () => {
    const onComplete = vi.fn();
    mount(kindActivity('question_pick_many', QUESTION_PICK_MANY_SPEC), { onComplete });
    expect(screen.queryByTestId('question-other')).toBeNull();
    expect(screen.queryByTestId('question-text')).toBeNull();
    const options = screen.getAllByTestId('question-option');
    await userEvent.click(options[0]);
    await userEvent.click(options[2]);
    await userEvent.click(screen.getByTestId('question-submit'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('question_pick_one REFUSES `allow_other` — the in-place "Outro" is gone', () => {
    mount(kindActivity('question_pick_one', { ...QUESTION_PICK_ONE_SPEC, allow_other: true }));
    expect(invalidCard('question_pick_one')).not.toBeNull();
  });

  it('question_write: the free answer is the whole input; the submit waits for text', async () => {
    const onComplete = vi.fn();
    mount(kindActivity('question_write', QUESTION_WRITE_SPEC), { onComplete });
    expect(screen.queryAllByTestId('question-option')).toHaveLength(0);
    expect(screen.queryByTestId('question-other')).toBeNull();
    // Nothing to pick is this kind's design, not a spec with its options missing.
    expect(screen.queryByText(/nenhuma opção configurada|no options configured/i)).toBeNull();
    expect(screen.getByTestId('question-submit')).toBeDisabled();
    await userEvent.type(screen.getByTestId('question-text'), 'Testar o contrato primeiro.');
    await userEvent.click(screen.getByTestId('question-submit'));
    expect(onComplete).toHaveBeenCalledWith(true, expect.objectContaining({ response: 'Testar o contrato primeiro.' }));
  });
});

/* ─────────────────── the shell predicates agree with the parent kind ─────── */

describe('the shell predicates treat each kind like the old kind it came from', () => {
  it.each(ONE_BEHAVIOUR_KINDS.filter((k) => /^(chat|terminal)_/.test(k)))(
    '%s is a sandbox: scenario family, footer verdict, answerable live, revealable',
    (kind) => {
      expect(isScenarioKind(kind)).toBe(true);
      expect(isFooterGradedKind(kind)).toBe(true);
      expect(isAnswerableLiveKind(kind)).toBe(true);
      expect(hasRevealableAnswer(kind)).toBe(true);
    },
  );

  it('the fill code kinds say "guided" by KIND; the editor kinds do not', () => {
    for (const kind of ['code_fill_bank', 'code_fill_select', 'code_fill_type'] as const) {
      expect(activityHasRevealableAnswer(kindActivity(kind, {}))).toBe(true);
    }
    for (const kind of ['code_editor_checks', 'code_editor_ungraded'] as const) {
      expect(activityHasRevealableAnswer(kindActivity(kind, {}))).toBe(false);
    }
    for (const kind of ONE_BEHAVIOUR_KINDS.filter((k) => k.startsWith('code_'))) {
      expect(canReopenSubmission(kind)).toBe(true);
      expect(isAnswerableLiveKind(kind)).toBe(true);
    }
  });

  it('document_reflect is an exercise by KIND and document_read is not — no rubric probe', () => {
    expect(isExerciseActivity(kindActivity('document_reflect', DOCUMENT_REFLECT_SPEC))).toBe(true);
    expect(isExerciseActivity(kindActivity('document_read', DOCUMENT_READING_SPEC))).toBe(false);
  });

  it('document_ai_judge is an exercise only where a judge exists — the shell never traps the learner', () => {
    // No rubric at all: the KIND says "AI judge", so no rubric is needed.
    const act = kindActivity('document_ai_judge', DOCUMENT_AI_JUDGE_KIND_SPEC);
    apiConfigured.mockReturnValue(true);
    expect(isExerciseActivity(act)).toBe(true);
    // No itera-api: the kind shows its "unavailable" card, and the shell offers
    // "Continuar" instead of waiting for a verdict that cannot come.
    apiConfigured.mockReturnValue(false);
    expect(isExerciseActivity(act)).toBe(false);
  });

  it.each(ONE_BEHAVIOUR_KINDS.filter((k) => k !== 'document_read'))(
    '%s keeps the artifact default of its old kind',
    (kind) => {
      const parent = transitionKindOf(kind);
      const parentDefault = KIND_ARTIFACT_DEFAULTS[parent as ActivityKind];
      expect(KIND_ARTIFACT_DEFAULTS[kind as ActivityKind]).toEqual(parentDefault);
    },
  );
});
