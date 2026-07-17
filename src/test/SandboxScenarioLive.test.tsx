import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';
import {
  isByocLive,
  isRatingCorrect,
  computeOutcome,
  buildJudgeContent,
} from '@/components/branded/activity/sandbox-live/byocLive';

/**
 * BYOC live path. The pure helpers are the COMPARISON LOGIC the e2e asserts
 * (learner-rating × judge-verdict → PASS/FAIL); the component tests drive the
 * full 2-step flow with the responder + judge MOCKED, proving all four binary
 * scenarios, the retry loop, and graceful degrade — without any network.
 */

// Mock the itera-api client so no network is hit; each test sets the verdicts.
const respond = vi.fn();
const judge = vi.fn();
vi.mock('@/api/iteraApi', () => ({
  iteraApiConfigured: () => true,
  respond: (...a: unknown[]) => respond(...a),
  judge: (...a: unknown[]) => judge(...a),
}));

// A signed-in session with a token (the component reads session.access_token).
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'test-token' } }),
}));

// Import AFTER the mocks are registered.
import { SandboxScenarioLiveActivity } from '@/components/branded/activity/sandbox-live/SandboxScenarioLiveActivity';
import { LiveActivityRenderer } from '@/components/branded/activity/LiveActivityRenderer';

const BYOC_SPEC = {
  openness: 'byoc',
  title: { pt: 'Contexto muda tudo', en: 'Context changes everything' },
  prompt: { pt: 'Traga seu contexto', en: 'Bring your context' },
};

function makeActivity(spec: Record<string, unknown> = BYOC_SPEC): Activity {
  return { id: '11111111-1111-1111-1111-111111111111', lessonId: 'l', ordinal: 0, kind: 'sandbox_scenario', spec, rubric: null };
}

function renderLive(onComplete = vi.fn(), activity = makeActivity()) {
  render(
    <I18nProvider>
      <SandboxScenarioLiveActivity activity={activity} onComplete={onComplete} />
    </I18nProvider>,
  );
  return onComplete;
}

function mockRespond(response: string, available = true) {
  respond.mockResolvedValueOnce({ response, model: 'test/model', responder_available: available });
}
/** A respond() result that ALSO carries the deterministic ground-truth fields. */
function mockRespondWithContextGood(response: string, contextGood: boolean, reason: string, available = true) {
  respond.mockResolvedValueOnce({
    response,
    model: 'test/model',
    responder_available: available,
    context_good: contextGood,
    reason,
  });
}
function mockJudge(passed: boolean, available = true) {
  judge.mockResolvedValueOnce({
    result_id: 'r',
    activity_id: 'a',
    attempt: 1,
    status: passed ? 'passed' : 'failed',
    passed,
    score: passed ? 90 : 20,
    feedback: passed ? 'The response is specific and useful.' : 'The response is generic and ignores the input.',
    criteria: [],
    model: 'test/model',
    progress_status: 'completed',
    judge_available: available,
  });
}

/** Compose + send the learner's input, then wait for the eval panel. */
async function sendInput(text: string) {
  fireEvent.change(screen.getByTestId('byoc-input'), { target: { value: text } });
  fireEvent.click(screen.getByTestId('byoc-send'));
  await waitFor(() => expect(screen.getByTestId('byoc-eval')).toBeInTheDocument(), { timeout: 8000 });
}

async function rateAndSettle(rating: 'good' | 'bad') {
  fireEvent.click(screen.getByTestId(`byoc-rate-${rating}`));
  await waitFor(() => expect(screen.getByTestId('byoc-outcome')).toBeInTheDocument(), { timeout: 8000 });
  return screen.getByTestId('byoc-outcome');
}

beforeEach(() => {
  respond.mockReset();
  judge.mockReset();
});

describe('BYOC helpers — the comparison logic', () => {
  it('isByocLive only matches a byoc/live sandbox_scenario', () => {
    expect(isByocLive({ kind: 'sandbox_scenario', spec: { openness: 'byoc' } })).toBe(true);
    expect(isByocLive({ kind: 'sandbox_scenario', spec: { live: true } })).toBe(true);
    expect(isByocLive({ kind: 'sandbox_scenario', spec: { openness: 'fixed' } })).toBe(false);
    expect(isByocLive({ kind: 'quiz', spec: { openness: 'byoc' } })).toBe(false);
    expect(isByocLive({ kind: 'sandbox_scenario', spec: null })).toBe(false);
  });

  it('isRatingCorrect: rating agrees with the judge verdict', () => {
    expect(isRatingCorrect('good', true)).toBe(true); // good response, rated good
    expect(isRatingCorrect('bad', false)).toBe(true); // bad response, rated bad
    expect(isRatingCorrect('good', false)).toBe(false); // bad response, rated good
    expect(isRatingCorrect('bad', true)).toBe(false); // good response, rated bad
  });

  it('computeOutcome folds availability in (all four scenarios + unverified)', () => {
    expect(computeOutcome('good', true, true)).toBe('pass');
    expect(computeOutcome('bad', false, true)).toBe('pass');
    expect(computeOutcome('good', false, true)).toBe('fail');
    expect(computeOutcome('bad', true, true)).toBe('fail');
    expect(computeOutcome('good', true, false)).toBe('unverified');
  });

  it('buildJudgeContent embeds both the input and the response', () => {
    const c = buildJudgeContent('my ctx', 'the answer');
    expect(c).toContain('my ctx');
    expect(c).toContain('the answer');
    expect(c).toMatch(/passed=true ONLY if the response is GOOD/i);
  });
});

describe('LiveActivityRenderer — additive dispatch (delegates non-live to the base renderer)', () => {
  it('routes a byoc sandbox_scenario to the live component', () => {
    render(
      <I18nProvider>
        <LiveActivityRenderer activity={makeActivity()} onComplete={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('byoc-live')).toBeInTheDocument();
  });

  it('delegates a NON-byoc sandbox_scenario to Samuel\'s ActivityRenderer (no live surface)', () => {
    // openness:'fixed' is not byoc → must NOT render the live surface; it flows
    // through the base renderer (which here shows the invalid-spec fallback for a
    // non-Scenario spec — proving delegation reached the untouched renderer).
    render(
      <I18nProvider>
        <LiveActivityRenderer activity={makeActivity({ openness: 'fixed' })} onComplete={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('byoc-live')).not.toBeInTheDocument();
    expect(screen.getByTestId('sandbox-invalid')).toBeInTheDocument();
  });

  it('forceLive routes a plain sandbox_scenario to the live component (test-route opt-in)', () => {
    render(
      <I18nProvider>
        <LiveActivityRenderer activity={makeActivity({})} onComplete={vi.fn()} forceLive />
      </I18nProvider>,
    );
    expect(screen.getByTestId('byoc-live')).toBeInTheDocument();
  });
});

describe('SandboxScenarioLiveActivity — full 2-step flow (mocked LLM)', () => {
  it('good response + rated good → PASS, Continuar fires onComplete(true)', async () => {
    mockRespond('A precise, on-topic answer using the given context.', true);
    mockJudge(true);
    const onComplete = renderLive();

    await sendInput('Rich, specific context: build a REST API in Go with auth.');
    const outcome = await rateAndSettle('good');

    expect(outcome.getAttribute('data-outcome')).toBe('pass');
    expect(outcome.getAttribute('data-judge-verdict')).toBe('good');
    expect(outcome.getAttribute('data-learner-rating')).toBe('good');
    expect(screen.getByTestId('byoc-feedback')).toBeInTheDocument();

    const cta = screen.getByTestId('byoc-continue') as HTMLButtonElement;
    fireEvent.click(cta);
    expect(onComplete).toHaveBeenCalledWith(true);
  }, 20000);

  it('good response + rated bad → FAIL, retry then rate good → PASS', async () => {
    mockRespond('A precise, on-topic answer.', true);
    mockJudge(true); // first judge: response is good
    renderLive();

    await sendInput('rich context');
    let outcome = await rateAndSettle('bad');
    expect(outcome.getAttribute('data-outcome')).toBe('fail');
    expect(screen.getByTestId('byoc-feedback')).toBeInTheDocument();

    // Retry → re-rate correctly. Second judge call returns good again.
    mockJudge(true);
    fireEvent.click(screen.getByTestId('byoc-retry'));
    await waitFor(() => expect(screen.getByTestId('byoc-eval')).toBeInTheDocument());
    outcome = await rateAndSettle('good');
    expect(outcome.getAttribute('data-outcome')).toBe('pass');
    expect(screen.getByTestId('byoc-continue')).toBeInTheDocument();
  }, 20000);

  it('bad response + rated bad → PASS (garbage/empty context path)', async () => {
    mockRespond('A vague, generic non-answer.', true);
    mockJudge(false); // response is bad
    renderLive();

    await sendInput('.');
    const outcome = await rateAndSettle('bad');
    expect(outcome.getAttribute('data-outcome')).toBe('pass');
    expect(outcome.getAttribute('data-judge-verdict')).toBe('bad');
    expect(outcome.getAttribute('data-learner-rating')).toBe('bad');
  }, 20000);

  it('bad response + rated good → FAIL', async () => {
    mockRespond('A vague, generic non-answer.', true);
    mockJudge(false);
    renderLive();

    await sendInput('.');
    const outcome = await rateAndSettle('good');
    expect(outcome.getAttribute('data-outcome')).toBe('fail');
  }, 20000);

  it('judge unavailable → UNVERIFIED, still lets the learner continue', async () => {
    mockRespond('Some answer.', true);
    mockJudge(false, false); // judge_available:false
    const onComplete = renderLive();

    await sendInput('context');
    const outcome = await rateAndSettle('good');
    expect(outcome.getAttribute('data-outcome')).toBe('unverified');

    fireEvent.click(screen.getByTestId('byoc-continue'));
    expect(onComplete).toHaveBeenCalledWith(true);
  }, 20000);

  it('responder degraded → surfaces a note but never hard-blocks', async () => {
    mockRespond('A IA está temporariamente indisponível.', false);
    mockJudge(false);
    renderLive();

    await sendInput('context');
    expect(screen.getByTestId('byoc-responder-degraded')).toBeInTheDocument();
    // The learner can still rate; the flow continues.
    const outcome = await rateAndSettle('bad');
    expect(outcome).toBeInTheDocument();
  }, 20000);
});

describe('SandboxScenarioLiveActivity — context_good deterministic ground truth (#5 fix)', () => {
  // Regression coverage for the bug Tainan flagged: a red "NÃO FOI DESSA VEZ"
  // header next to judge `feedback` text that praised a CORRECT judgment. The
  // fix consumes `context_good` (established ONCE, at generation time,
  // alongside `reason`) as the ground truth instead of making a second
  // `/v1/embed/judge` call whose `passed` boolean could disagree with its own
  // `feedback` text. These tests assert the JUDGE NETWORK CALL IS SKIPPED
  // entirely when `context_good` is present, and that the header/outcome is
  // fully consistent with it — no more contradiction is possible by
  // construction (single source of truth).

  it('context_good:true + rated good → PASS, judge() never called, reason surfaces as feedback', async () => {
    mockRespondWithContextGood('A precise, on-topic answer.', true, 'The response directly answers the specific context given.');
    const onComplete = renderLive();

    await sendInput('Rich, specific context.');
    const outcome = await rateAndSettle('good');

    expect(outcome.getAttribute('data-outcome')).toBe('pass');
    expect(outcome.getAttribute('data-judge-verdict')).toBe('good');
    expect(outcome.getAttribute('data-learner-rating')).toBe('good');
    expect(screen.getByTestId('byoc-feedback')).toHaveTextContent(
      'The response directly answers the specific context given.',
    );
    // The deterministic path never hits the network judge — no possibility
    // of the passed/feedback pair disagreeing with each other.
    expect(judge).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('byoc-continue'));
    expect(onComplete).toHaveBeenCalledWith(true);
  }, 20000);

  it('context_good:false + rated good → FAIL (header/reason consistent, no contradiction possible)', async () => {
    mockRespondWithContextGood('A vague, generic non-answer.', false, 'The response ignores the specific context and stays generic.');
    renderLive();

    await sendInput('.');
    const outcome = await rateAndSettle('good');

    expect(outcome.getAttribute('data-outcome')).toBe('fail');
    expect(outcome.getAttribute('data-judge-verdict')).toBe('bad');
    expect(screen.getByTestId('byoc-feedback')).toHaveTextContent(
      'The response ignores the specific context and stays generic.',
    );
    expect(judge).not.toHaveBeenCalled();
  }, 20000);

  it('context_good:false + rated bad (learner correctly judged a bad response) → PASS', async () => {
    mockRespondWithContextGood('A vague, generic non-answer.', false, 'Generic, does not use the given context.');
    renderLive();

    await sendInput('.');
    const outcome = await rateAndSettle('bad');

    expect(outcome.getAttribute('data-outcome')).toBe('pass');
    expect(judge).not.toHaveBeenCalled();
  }, 20000);

  it('retry after context_good path re-uses the SAME ground truth (no second respond/judge call)', async () => {
    mockRespondWithContextGood('A precise, on-topic answer.', true, 'Directly on-topic.');
    renderLive();

    await sendInput('rich context');
    let outcome = await rateAndSettle('bad');
    expect(outcome.getAttribute('data-outcome')).toBe('fail');

    fireEvent.click(screen.getByTestId('byoc-retry'));
    await waitFor(() => expect(screen.getByTestId('byoc-eval')).toBeInTheDocument());
    outcome = await rateAndSettle('good');
    expect(outcome.getAttribute('data-outcome')).toBe('pass');
    // Neither respond() nor judge() fired again for the retry — same response,
    // same ground truth, purely a client-side re-comparison.
    expect(respond).toHaveBeenCalledTimes(1);
    expect(judge).not.toHaveBeenCalled();
  }, 20000);

  it('context_good ABSENT (legacy respond() shape) falls back to the judge()-based path unchanged', async () => {
    // No context_good/reason fields at all — simulates an itera-api deploy
    // that hasn't shipped the contract extension yet.
    mockRespond('A precise, on-topic answer.', true);
    mockJudge(true);
    renderLive();

    await sendInput('rich context');
    const outcome = await rateAndSettle('good');

    expect(outcome.getAttribute('data-outcome')).toBe('pass');
    expect(judge).toHaveBeenCalledTimes(1);
  }, 20000);
});

describe('SandboxScenarioLiveActivity — Enter-to-submit composer', () => {
  it('Enter (no Shift) submits the composed input and advances to the eval step', async () => {
    mockRespond('A precise, on-topic answer using the given context.', true);
    renderLive();

    const input = screen.getByTestId('byoc-input');
    fireEvent.change(input, { target: { value: 'a real, well-scoped context' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // Enter fired doSend → the responder ran and the eval step surfaced.
    await waitFor(() => expect(screen.getByTestId('byoc-eval')).toBeInTheDocument(), { timeout: 8000 });
    expect(respond).toHaveBeenCalledWith('a real, well-scoped context', 'test-token', undefined);
  }, 20000);

  it('Shift+Enter does NOT submit — it keeps the newline for multiline input', () => {
    renderLive();

    const input = screen.getByTestId('byoc-input');
    fireEvent.change(input, { target: { value: 'line one' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

    // Still composing: the composer is present and no responder call fired.
    expect(screen.getByTestId('byoc-input')).toBeInTheDocument();
    expect(screen.queryByTestId('byoc-eval')).not.toBeInTheDocument();
    expect(respond).not.toHaveBeenCalled();
  });

  it('Enter on an empty composer does nothing (no submit)', () => {
    renderLive();

    const input = screen.getByTestId('byoc-input');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(respond).not.toHaveBeenCalled();
    expect(screen.getByTestId('byoc-input')).toBeInTheDocument();
  });
});
