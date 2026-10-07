import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LessonPlayer from '@/pages/LessonPlayer';
import {
  buildAttemptFeedback,
  fetchAnswerActions,
  resumeIndexFor,
  MAX_RESPONSE_CHARS,
} from '@/services/progress.service';
import type { Activity } from '@/types/content';
import { storeLessonAnswer } from '@/utils/lessonAnswerStorage';
import { readCodeAttempts, saveCodeAttempts } from '@/services/codeAttempts.service';
import { rememberStorageScope } from '@/utils/storageScope';

/**
 * Regression lock for the two defects the 2026-07-28 persona E2E found (D2, D1).
 *
 * D2 — a wrong answer was recorded NOWHERE. `persistActivityProgress` ran only
 *      inside `if (correct)` and inserted `passed: true` as a literal, so
 *      `activity_results.passed` never held `false` and every pass rate built on
 *      it was 100% by construction.
 * D1 — the player never READ `itera.progress`, so a learner who completed ten
 *      activities and reloaded was dropped back on activity 1.
 *
 * Both tests were verified to FAIL against the pre-fix commit (5eecde6):
 *   D2 → no `activity_results` insert is captured at all (the assertion on the
 *        recorded row throws on `undefined`).
 *   D1 → the player renders activity 1 instead of activity 3.
 * A test that cannot fail is not a regression lock, so that check is the point.
 */

const useLessonContent = vi.fn();
const useNextLesson = vi.fn();

/** Every row handed to `.insert()`, by table. The D2 assertion reads this. */
const inserts: Record<string, unknown[]> = {};
/** Every payload handed to `.upsert()`, with its options. */
const upserts: Array<{ table: string; payload: Record<string, unknown>; opts?: unknown }> = [];
/** What `progress` rows the fake DB hands back to the resume read. */
let progressRows: Array<{ activity_id: string; status: string }> | null = [];
/**
 * Lets a test make a specific `.insert()` fail, the way PostgREST does when the
 * payload names a column the deployed schema does not have. Null = insert works.
 */
/** What the learner's attempt log / trace reads return, newest first. */
let attemptRows: Array<Record<string, unknown>> | null = [];
let traceRows: Array<Record<string, unknown>> = [];
function orderedRead(table: string) {
  if (table === 'activity_results') {
    return attemptRows ? { data: attemptRows, error: null } : { data: null, error: { message: 'down' } };
  }
  return { data: table === 'activity_traces' ? traceRows : [], error: null };
}
let insertErrorFor:
  | ((table: string, payload: Record<string, unknown>) => { message: string } | null)
  | null = null;

vi.mock('@/api/iteraApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/iteraApi')>()),
  iteraApiConfigured: () => false,
}));
vi.mock('@/hooks', () => ({
  useLessonContent: (id?: string) => useLessonContent(id),
  useNextLesson: (id?: string) => useNextLesson(id),
}));

/**
 * The renderer is stubbed to two buttons so a test can settle an activity either
 * way. The real components are irrelevant here — what is under test is what the
 * shell PERSISTS for each outcome.
 */
/**
 * When set, the stubbed activity settles from a MOUNT EFFECT instead of waiting
 * for a click. That is not a contrivance — `handleComplete` already documents
 * that *"some of them (the sandbox family) re-fire `onComplete` from a mount
 * effect when they read themselves as done"*. It is also the only way to settle
 * an attempt in the SAME commit that first renders the activity, which is the
 * window the origin race lived in. See the `activityStartedAt` describe block.
 */
let settleOnMount: { correct: boolean; response: string } | null = null;

vi.mock('@/components/branded/activity/ActivityRenderer', () => ({
  ActivityRenderer: ({
    activity,
    onComplete,
    priorAnswer,
  }: {
    activity: { status?: string };
    onComplete: (c: boolean, detail?: { response?: string }) => void;
    priorAnswer?: { response?: string };
  }) => {
    // Child effects flush BEFORE the parent's, so this fires while the player's
    // own post-render effects are still pending.
    useEffect(() => {
      if (settleOnMount) onComplete(settleOnMount.correct, { response: settleOnMount.response });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
    <>
      <span
        data-testid="stub-state"
        data-status={activity.status ?? ''}
        data-prior={priorAnswer?.response ?? ''}
      />
      <button
        data-testid="stub-correct"
        onClick={() => onComplete(true, { response: 'A opção certa' })}
      >
        acertar
      </button>
      {/* A miss rides up WHAT was answered — the distractor the learner picked. */}
      <button
        data-testid="stub-wrong"
        onClick={() => onComplete(false, { response: 'O distrator errado' })}
      >
        errar
      </button>
      <button
        data-testid="stub-wrong-long"
        onClick={() => onComplete(false, { response: 'x'.repeat(5000) })}
      >
        errar longo
      </button>
    </>
    );
  },
}));

/**
 * A chainable fake of the supabase client covering exactly the two shapes the
 * progress service uses: the write (`upsert` / `insert`) and the resume read
 * (`select → eq → in`). Terminal calls resolve; intermediate calls return the
 * same builder.
 */
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {
        upsert: (payload: Record<string, unknown>, opts?: unknown) => {
          upserts.push({ table, payload, opts });
          return Promise.resolve({ error: null });
        },
        insert: (payload: Record<string, unknown>) => {
          (inserts[table] ??= []).push(payload);
          const err = insertErrorFor?.(table, payload) ?? null;
          return Promise.resolve({ error: err });
        },
        select: () => builder,
        eq: () => builder,
        // `progress` awaits `.in()` itself; the attempt log goes on to `.order().limit()`.
        in: () =>
          Object.assign(
            Promise.resolve(
              table === 'progress' && !progressRows
                ? { data: null, error: { message: 'down' } }
                : { data: table === 'progress' ? progressRows : [], error: null }
            ),
            { order: () => ({ limit: () => Promise.resolve(orderedRead(table)) }) }
          ),
        order: () => ({ limit: () => Promise.resolve(orderedRead(table)) }),
      };
      return builder;
    },
  }),
}));
vi.mock('@/services/iteraUser', () => ({
  getIteraUserId: vi.fn().mockResolvedValue('itera-user-1'),
}));
vi.mock('@/services/gamification.service', () => ({
  awardActivityXp: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ lessonId: 'lesson-1' }),
  useNavigate: () => vi.fn(),
}));

function activity(id: string, ordinal: number): Activity {
  return { id, lessonId: 'lesson-1', ordinal, kind: 'quiz', spec: {}, rubric: null } as Activity;
}

/** A four-activity lesson: enough for "resume to the middle" to be meaningful. */
const ACTIVITY_IDS = ['a1', 'a2', 'a3', 'a4'];

function lessonData() {
  return {
    id: 'lesson-1',
    title: { pt: 'Contexto muda tudo' },
    activities: ACTIVITY_IDS.map((id, i) => activity(id, i + 1)),
  };
}

function renderPlayer() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <LessonPlayer />
      </I18nProvider>
    </MemoryRouter>
  );
}

/** The player gates first paint on the resume read; wait for it to settle. */
async function waitForPlayerReady() {
  await waitFor(() => expect(screen.queryByTestId('lesson-loading')).toBeNull(), { timeout: 5000 });
}

beforeEach(async () => {
  localStorage.clear();
  for (const k of Object.keys(inserts)) delete inserts[k];
  upserts.length = 0;
  progressRows = [];
  attemptRows = [];
  traceRows = [];
  insertErrorFor = null;
  // Module-level mock: without clearing, call counts accumulate across cases in
  // this file and the "no XP for a miss" assertion sees an earlier test's award.
  const { awardActivityXp } = await import('@/services/gamification.service');
  vi.mocked(awardActivityXp).mockClear();
  useLessonContent.mockReset();
  useNextLesson.mockReset();
  settleOnMount = null;
  useLessonContent.mockReturnValue({
    data: lessonData(),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  useNextLesson.mockReturnValue({ data: null });
});

describe('D2 — a WRONG answer is recorded, with passed=false', () => {
  it('inserts an activity_results row for a miss', async () => {
    renderPlayer();
    await waitForPlayerReady();

    // Settle the graded activity as WRONG, then commit via the footer.
    fireEvent.click(screen.getByTestId('stub-wrong'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });

    // The whole point of the fix: the row EXISTS and it tells the truth.
    // Pre-fix this array is empty and the row below is `undefined`.
    const row = inserts['activity_results'][0] as {
      activity_id: string;
      passed: boolean;
      feedback: { response?: string };
    };
    expect(row.activity_id).toBe('a1');
    expect(row.passed).toBe(false);
    // …and it records WHAT was answered, not merely that it was wrong. A bare
    // boolean counts errors; this is what lets an instructor SEE the error.
    expect(row.feedback.response).toBe('O distrator errado');
  });

  it('truncates a long free-text answer and says that it did', async () => {
    renderPlayer();
    await waitForPlayerReady();

    fireEvent.click(screen.getByTestId('stub-wrong-long'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });
    const fb = (inserts['activity_results'][0] as { feedback: Record<string, unknown> }).feedback;
    expect((fb.response as string).length).toBe(2000);
    expect(fb.response_truncated).toBe(true);
    // The original length survives, so the loss is measurable rather than silent.
    expect(fb.response_length).toBe(5000);
  });

  it('still records passed=true for a correct answer', async () => {
    renderPlayer();
    await waitForPlayerReady();

    fireEvent.click(screen.getByTestId('stub-correct'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });
    const row = inserts['activity_results'][0] as {
      passed: boolean;
      feedback: { response?: string };
    };
    expect(row.passed).toBe(true);
    expect(row.feedback.response).toBe('A opção certa');
  });

  it('never demotes a completed activity: a miss writes in_progress with ignoreDuplicates', async () => {
    // A miss must not be able to overwrite an existing 'completed' row — hence
    // ON CONFLICT DO NOTHING rather than a plain upsert.
    renderPlayer();
    await waitForPlayerReady();

    fireEvent.click(screen.getByTestId('stub-wrong'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    await waitFor(() => expect(upserts.some((u) => u.table === 'progress')).toBe(true), {
      timeout: 5000,
    });
    const progressWrite = upserts.find((u) => u.table === 'progress');
    expect(progressWrite?.payload.status).toBe('in_progress');
    expect((progressWrite?.opts as { ignoreDuplicates?: boolean })?.ignoreDuplicates).toBe(true);
  });

  it('awards no XP for a miss', async () => {
    const { awardActivityXp } = await import('@/services/gamification.service');
    renderPlayer();
    await waitForPlayerReady();

    fireEvent.click(screen.getByTestId('stub-wrong'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });
    expect(awardActivityXp).not.toHaveBeenCalled();
  });
});

describe('D1 — the lesson resumes where the learner stopped', () => {
  it('lands on the first UNFINISHED activity after a reload, not on activity 1', async () => {
    // The learner already completed a1 and a2 in an earlier session.
    progressRows = [
      { activity_id: 'a1', status: 'completed' },
      { activity_id: 'a2', status: 'completed' },
    ];

    renderPlayer();
    await waitForPlayerReady();

    // Pre-fix this renders a1: the player never read itera.progress.
    await waitFor(() => expect(screen.getByTestId('lesson-activity')).toBeTruthy(), {
      timeout: 5000,
    });
    expect(screen.getByTestId('lesson-activity').getAttribute('data-activity-id')).toBe('a3');
  });

  it('reflects the resumed position in the progress bar instead of zeroing it', async () => {
    progressRows = [
      { activity_id: 'a1', status: 'completed' },
      { activity_id: 'a2', status: 'completed' },
    ];
    renderPlayer();
    await waitForPlayerReady();
    // 2 of 4 done → 50%. Pre-fix the bar read 0 on every single reload, which is
    // the "nada indica que já estava gravado" half of the D1 report.
    expect(screen.getByTestId('lesson-progress').getAttribute('aria-valuenow')).toBe('50');
  });

  it('does NOT count an attempted-but-unpassed activity as done', async () => {
    progressRows = [
      { activity_id: 'a1', status: 'completed' },
      { activity_id: 'a2', status: 'in_progress' },
    ];
    renderPlayer();
    await waitForPlayerReady();
    // a2 was reached and missed — the learner gets another pass at it.
    expect(screen.getByTestId('lesson-activity').getAttribute('data-activity-id')).toBe('a2');
    expect(screen.getByTestId('lesson-progress').getAttribute('aria-valuenow')).toBe('25');
  });

  it('goes straight to the completion screen when everything is already done', async () => {
    progressRows = ACTIVITY_IDS.map((id) => ({ activity_id: id, status: 'completed' }));
    renderPlayer();
    await waitForPlayerReady();
    await waitFor(() => expect(screen.getByTestId('lesson-complete')).toBeTruthy(), {
      timeout: 5000,
    });
  });

  it('starts at activity 1 when there is no persisted progress', async () => {
    progressRows = [];
    renderPlayer();
    await waitForPlayerReady();
    expect(screen.getByTestId('lesson-activity').getAttribute('data-activity-id')).toBe('a1');
  });
});

describe('the result stands — it is recorded at the answer and survives a reload', () => {
  const shownId = () => screen.getByTestId('lesson-activity').getAttribute('data-activity-id');
  const completedUpserts = () =>
    upserts.filter((u) => u.table === 'progress' && u.payload.status === 'completed');

  beforeEach(() => {
    localStorage.clear();
    rememberStorageScope('itera-user-1');
  });

  it('records a pass the instant it settles, before "Continuar", and only once', async () => {
    renderPlayer();
    await waitForPlayerReady();

    fireEvent.click(screen.getByTestId('stub-correct'));
    // Pre-fix nothing is written here: the write waited for the footer.
    await waitFor(() => expect(completedUpserts()).toHaveLength(1), { timeout: 5000 });
    expect(shownId()).toBe('a1');

    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    await waitFor(() => expect(shownId()).toBe('a2'), { timeout: 5000 });
    expect(completedUpserts()).toHaveLength(1);
    expect(inserts['activity_results']).toHaveLength(1);
  });

  it('records a miss the instant it settles, before "Continuar", and only once', async () => {
    renderPlayer();
    await waitForPlayerReady();

    fireEvent.click(screen.getByTestId('stub-wrong'));
    await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });

    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    await waitFor(() => expect(shownId()).toBe('a2'), { timeout: 5000 });
    expect(inserts['activity_results']).toHaveLength(1);
  });

  it('does not write a second pass when the activity settles again during the review beat', async () => {
    renderPlayer();
    await waitForPlayerReady();
    fireEvent.click(screen.getByTestId('stub-correct'));
    fireEvent.click(screen.getByTestId('stub-correct'));
    await waitFor(() => expect(completedUpserts()).toHaveLength(1), { timeout: 5000 });
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    await waitFor(() => expect(shownId()).toBe('a2'), { timeout: 5000 });
    expect(completedUpserts()).toHaveLength(1);
  });

  it('a reload during the review beat does not re-open the exercise blank', async () => {
    const first = renderPlayer();
    await waitForPlayerReady();
    fireEvent.click(screen.getByTestId('stub-wrong'));
    await screen.findByTestId('feedback-footer');
    await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });
    first.unmount();

    // The server only knows `in_progress` for a miss — the device knows it was answered.
    progressRows = [{ activity_id: 'a1', status: 'in_progress' }];
    renderPlayer();
    await waitForPlayerReady();
    expect(shownId()).toBe('a2');
    // Resuming must not write the attempt a second time.
    expect(inserts['activity_results']).toHaveLength(1);
  });

  it('re-opens a missed exercise on its answer, locked, and retries only on demand', async () => {
    const first = renderPlayer();
    await waitForPlayerReady();
    fireEvent.click(screen.getByTestId('stub-wrong'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    await waitFor(() => expect(shownId()).toBe('a2'), { timeout: 5000 });
    first.unmount();

    progressRows = [{ activity_id: 'a1', status: 'in_progress' }];
    renderPlayer();
    await waitForPlayerReady();
    fireEvent.click(screen.getByTestId('lesson-prev'));
    await waitFor(() => expect(shownId()).toBe('a1'));

    const state = () => screen.getByTestId('stub-state');
    expect(state().getAttribute('data-status')).toBe('done');
    expect(state().getAttribute('data-prior')).toBe('O distrator errado');

    // Locked: answering again without asking for a retry settles nothing.
    fireEvent.click(screen.getByTestId('stub-correct'));
    expect(screen.queryByTestId('feedback-footer-continue')).toBeNull();
    expect(completedUpserts()).toHaveLength(0);

    fireEvent.click(screen.getByTestId('lesson-retry-missed'));
    await waitFor(() => expect(state().getAttribute('data-status')).not.toBe('done'));
    expect(screen.queryByTestId('lesson-retry-missed')).toBeNull();
    fireEvent.click(screen.getByTestId('stub-correct'));
    await waitFor(() => expect(completedUpserts()).toHaveLength(1), { timeout: 5000 });
    // Both attempts are in the log: the retry adds to the miss, never replaces it.
    expect((inserts['activity_results'] as Array<{ passed: boolean }>).map((r) => r.passed)).toEqual([
      false,
      true,
    ]);
  });

  describe('a code exercise, which does not hold on the footer', () => {
    beforeEach(() => {
      const data = lessonData();
      data.activities[0] = { ...data.activities[0], kind: 'code_editor_checks' } as Activity;
      useLessonContent.mockReturnValue({ data, isPending: false, isError: false, refetch: vi.fn() });
    });

    it('keeps a miss: it moves on, re-opens locked, and the retry returns the lives', async () => {
      renderPlayer();
      await waitForPlayerReady();
      saveCodeAttempts('a1', '5');
      fireEvent.click(screen.getByTestId('stub-wrong'));
      await waitFor(() => expect(shownId()).toBe('a2'), { timeout: 5000 });
      expect(inserts['activity_results']).toHaveLength(1);

      fireEvent.click(screen.getByTestId('lesson-prev'));
      await waitFor(() => expect(shownId()).toBe('a1'));
      expect(screen.getByTestId('stub-state').getAttribute('data-status')).toBe('done');
      // Locked on the miss, the spent lives stay: only the retry returns them.
      expect(readCodeAttempts('a1')).toBe('5');
      fireEvent.click(screen.getByTestId('lesson-retry-missed'));
      expect(readCodeAttempts('a1')).toBeNull();
      await waitFor(() =>
        expect(screen.getByTestId('stub-state').getAttribute('data-status')).not.toBe('done')
      );
      // The retry itself is not an attempt.
      expect(inserts['activity_results']).toHaveLength(1);
    });

    it('does not strand a learner who reloads out of lives before pressing Continue', async () => {
      saveCodeAttempts('a1', '5');
      renderPlayer();
      await waitForPlayerReady();
      // Pre-fix: a1 on screen, no submit, no Continue, forward disabled — for good.
      expect(shownId()).toBe('a1');
      await screen.findByTestId('lesson-retry-missed');
      expect(screen.getByTestId('concept-continue')).toBeTruthy();
      await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });
      expect((inserts['activity_results'][0] as { passed: boolean }).passed).toBe(false);

      fireEvent.click(screen.getByTestId('concept-continue'));
      await waitFor(() => expect(shownId()).toBe('a2'), { timeout: 5000 });
      expect(inserts['activity_results']).toHaveLength(1);
    });

    it('records running out of lives once, not on every visit', async () => {
      saveCodeAttempts('a1', '5');
      const first = renderPlayer();
      await waitForPlayerReady();
      await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });
      first.unmount();
      progressRows = [{ activity_id: 'a1', status: 'in_progress' }];
      renderPlayer();
      await waitForPlayerReady();
      expect(shownId()).toBe('a2');
      fireEvent.click(screen.getByTestId('lesson-prev'));
      await waitFor(() => expect(shownId()).toBe('a1'));
      expect(inserts['activity_results']).toHaveLength(1);
    });

    it('leaves an exercise with lives to spare alone', async () => {
      saveCodeAttempts('a1', '4');
      renderPlayer();
      await waitForPlayerReady();
      expect(shownId()).toBe('a1');
      expect(screen.queryByTestId('lesson-retry-missed')).toBeNull();
      expect(inserts['activity_results']).toBeUndefined();
    });
  });

  it('offers no retry on an exercise the learner passed', async () => {
    progressRows = [{ activity_id: 'a1', status: 'completed' }];
    renderPlayer();
    await waitForPlayerReady();
    fireEvent.click(screen.getByTestId('lesson-prev'));
    await waitFor(() => expect(shownId()).toBe('a1'));
    expect(screen.queryByTestId('lesson-retry-missed')).toBeNull();
  });

  it('replays an answer whose write never landed before the tab closed', async () => {
    storeLessonAnswer('a1', {
      correct: true,
      settledAt: 1_700_000_000_000,
      saved: false,
      response: 'A opção certa',
    });
    renderPlayer();
    await waitForPlayerReady();
    expect(shownId()).toBe('a2');
    await waitFor(() => expect(completedUpserts()).toHaveLength(1), { timeout: 5000 });
    expect(completedUpserts()[0].payload.activity_id).toBe('a1');
  });
});

describe('the result follows the learner to another device', () => {
  const shownId = () => screen.getByTestId('lesson-activity').getAttribute('data-activity-id');
  const state = () => screen.getByTestId('stub-state');
  const at = (ms: number) => new Date(ms).toISOString();
  const T = 1_700_000_000_000;

  beforeEach(() => {
    localStorage.clear();
    rememberStorageScope('itera-user-1');
  });

  it('re-opens a miss made elsewhere locked on its answer, with the retry', async () => {
    progressRows = [{ activity_id: 'a1', status: 'in_progress' }];
    attemptRows = [
      { activity_id: 'a1', passed: false, feedback: { response: 'O distrator errado' }, created_at: at(T) },
    ];
    renderPlayer();
    await waitForPlayerReady();
    expect(shownId()).toBe('a2');
    fireEvent.click(screen.getByTestId('lesson-prev'));
    await waitFor(() => expect(shownId()).toBe('a1'));
    expect(state().getAttribute('data-status')).toBe('done');
    expect(state().getAttribute('data-prior')).toBe('O distrator errado');
    expect(screen.getByTestId('lesson-retry-missed')).toBeTruthy();
    // Reading the log back writes nothing.
    expect(inserts['activity_results']).toBeUndefined();
  });

  it('re-opens a pass made elsewhere on the answer that passed', async () => {
    progressRows = [{ activity_id: 'a1', status: 'completed' }];
    attemptRows = [
      { activity_id: 'a1', passed: true, feedback: { response: 'A opção certa' }, created_at: at(T + 9000) },
      { activity_id: 'a1', passed: false, feedback: { response: 'O distrator errado' }, created_at: at(T) },
    ];
    renderPlayer();
    await waitForPlayerReady();
    fireEvent.click(screen.getByTestId('lesson-prev'));
    await waitFor(() => expect(shownId()).toBe('a1'));
    expect(state().getAttribute('data-prior')).toBe('A opção certa');
    expect(screen.queryByTestId('lesson-retry-missed')).toBeNull();
  });

  it('leaves an exercise a lesson reset re-opened answerable', async () => {
    progressRows = [{ activity_id: 'a1', status: 'in_progress' }];
    attemptRows = [{ activity_id: 'a1', passed: true, feedback: {}, created_at: at(T) }];
    renderPlayer();
    await waitForPlayerReady();
    expect(shownId()).toBe('a1');
    expect(state().getAttribute('data-status')).not.toBe('done');
  });

  it('forgets a local pass the server re-opened, instead of locking it for good', async () => {
    storeLessonAnswer('a1', { correct: true, settledAt: T, saved: true });
    progressRows = [{ activity_id: 'a1', status: 'in_progress' }];
    renderPlayer();
    await waitForPlayerReady();
    expect(shownId()).toBe('a1');
    expect(state().getAttribute('data-status')).not.toBe('done');
    fireEvent.click(screen.getByTestId('stub-correct'));
    await screen.findByTestId('feedback-footer-continue');
  });

  it('does not send again an answer whose row landed just before the tab closed', async () => {
    storeLessonAnswer('a1', { correct: false, settledAt: T, saved: false, response: 'O distrator errado' });
    progressRows = [{ activity_id: 'a1', status: 'in_progress' }];
    attemptRows = [
      { activity_id: 'a1', passed: false, feedback: { response: 'O distrator errado' }, created_at: at(T + 400) },
    ];
    renderPlayer();
    await waitForPlayerReady();
    expect(shownId()).toBe('a2');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(inserts['activity_results']).toBeUndefined();
  });

  it('keeps the frontier past later answers when an earlier exercise is open again', async () => {
    progressRows = [
      { activity_id: 'a1', status: 'completed' },
      { activity_id: 'a3', status: 'completed' },
    ];
    renderPlayer();
    await waitForPlayerReady();
    expect(shownId()).toBe('a2');
    // a3 was already covered: forward is open up to a4.
    expect(screen.getByTestId('lesson-next').hasAttribute('disabled')).toBe(false);
  });

  it('keeps this device’s passes when PROGRESS cannot be read, even if the log can', async () => {
    storeLessonAnswer('a1', { correct: true, settledAt: T, saved: true });
    progressRows = null;
    attemptRows = [{ activity_id: 'a1', passed: true, feedback: {}, created_at: at(T) }];
    const first = renderPlayer();
    await waitForPlayerReady();
    // Without the guard this reads as a lesson reset and the pass is deleted.
    expect(shownId()).toBe('a2');
    first.unmount();
    progressRows = [{ activity_id: 'a1', status: 'completed' }];
    renderPlayer();
    await waitForPlayerReady();
    expect(shownId()).toBe('a2');
  });

  it('keeps this device’s record when the attempt log cannot be read', async () => {
    storeLessonAnswer('a1', { correct: true, settledAt: T, saved: true });
    attemptRows = null;
    renderPlayer();
    await waitForPlayerReady();
    expect(shownId()).toBe('a2');
  });
});

describe('fetchAnswerActions — the picked answer, read back from the trace', () => {
  const T = 1_700_000_000_000;
  const at = (ms: number) => new Date(ms).toISOString();
  const submit = (ids: string[], at_ms: number) => ({ type: 'answer_submitted', at_ms, payload: { option_ids: ids } });

  it('rebuilds wall-clock actions from the newest settled trace', async () => {
    traceRows = [{ started_at: at(T), outcome: null, actions: [{ type: 'opened', at_ms: 0 }, submit(['b'], 4000)] }];
    expect(await fetchAnswerActions('a1', T + 5000)).toEqual([
      { type: 'opened', at: T },
      { type: 'answer_submitted', at: T + 4000, payload: { option_ids: ['b'] } },
    ]);
  });

  it('never reads an abandoned trace as an answer', async () => {
    traceRows = [
      { started_at: at(T + 60_000), outcome: 'abandoned', actions: [{ type: 'opened', at_ms: 0 }] },
      { started_at: at(T), outcome: 'settled', actions: [submit(['a'], 1000)] },
    ];
    expect((await fetchAnswerActions('a1', T + 90_000))[0]?.payload).toEqual({ option_ids: ['a'] });
  });

  it('draws nothing when the attempt has no trace of its own', async () => {
    // A replayed attempt writes no trace: the previous attempt's picks are not its picks.
    traceRows = [{ started_at: at(T - 3_600_000), outcome: null, actions: [submit(['c'], 1000)] }];
    expect(await fetchAnswerActions('a1', T)).toEqual([]);
  });

  it('skips a retry opened well after the attempt being restored', async () => {
    traceRows = [
      { started_at: at(T + 3_600_000), outcome: null, actions: [submit(['c'], 1000)] },
      { started_at: at(T), outcome: null, actions: [submit(['a'], 1000)] },
    ];
    expect((await fetchAnswerActions('a1', T + 2000))[0]?.payload).toEqual({ option_ids: ['a'] });
  });

  it('tells two close attempts apart by their outcome', async () => {
    const settled = (passed: boolean, at_ms: number) => ({ type: 'attempt_settled', at_ms, payload: { passed } });
    traceRows = [
      { started_at: at(T + 20_000), outcome: null, actions: [submit(['a'], 1000), settled(true, 1000)] },
      { started_at: at(T), outcome: null, actions: [submit(['b'], 1000), settled(false, 1000)] },
    ];
    // The row's clock puts it nearer the miss; the pass is still the pass.
    expect((await fetchAnswerActions('a1', T + 2000, true))[0]?.payload).toEqual({ option_ids: ['a'] });
    expect((await fetchAnswerActions('a1', T + 2000, false))[0]?.payload).toEqual({ option_ids: ['b'] });
  });

  it('resolves to nothing when there is no trace', async () => {
    expect(await fetchAnswerActions('a1', T)).toEqual([]);
  });
});

describe('buildAttemptFeedback — the answer-content rule', () => {
  it('keeps a short answer verbatim', () => {
    expect(buildAttemptFeedback('opção B')).toEqual({ response: 'opção B' });
  });

  it('trims surrounding whitespace', () => {
    expect(buildAttemptFeedback('  opção B \n')).toEqual({ response: 'opção B' });
  });

  it('stores nothing for an absent or blank answer', () => {
    expect(buildAttemptFeedback(undefined)).toEqual({});
    expect(buildAttemptFeedback(null)).toEqual({});
    expect(buildAttemptFeedback('   ')).toEqual({});
  });

  it('keeps an answer exactly at the cap intact', () => {
    const exact = 'y'.repeat(MAX_RESPONSE_CHARS);
    expect(buildAttemptFeedback(exact)).toEqual({ response: exact });
  });

  it('truncates past the cap and records the real length', () => {
    const long = 'z'.repeat(MAX_RESPONSE_CHARS + 1);
    const fb = buildAttemptFeedback(long);
    expect(fb.response?.length).toBe(MAX_RESPONSE_CHARS);
    expect(fb.response_truncated).toBe(true);
    expect(fb.response_length).toBe(MAX_RESPONSE_CHARS + 1);
  });
});

describe('resumeIndexFor — the pure seek rule', () => {
  const ids = ['a1', 'a2', 'a3'];

  it('returns 0 with no progress at all', () => {
    expect(resumeIndexFor(ids, {})).toBe(0);
  });

  it('skips a leading run of completed activities', () => {
    expect(resumeIndexFor(ids, { a1: 'completed', a2: 'completed' })).toBe(2);
  });

  it('stops at the first gap rather than at the furthest completion', () => {
    // a3 done but a2 not: the learner still owes a2, so that is where they land.
    expect(resumeIndexFor(ids, { a1: 'completed', a3: 'completed' })).toBe(1);
  });

  it('treats in_progress as unfinished', () => {
    expect(resumeIndexFor(ids, { a1: 'completed', a2: 'in_progress' })).toBe(1);
  });

  it('skips an activity answered on this device, hit or miss', () => {
    expect(resumeIndexFor(ids, { a1: 'completed', a2: 'in_progress' }, new Set(['a2']))).toBe(2);
    expect(resumeIndexFor(ids, {}, new Set(ids))).toBe(ids.length);
  });

  it('returns the length when the whole lesson is done', () => {
    expect(resumeIndexFor(ids, { a1: 'completed', a2: 'completed', a3: 'completed' })).toBe(3);
  });
});

/**
 * Duration (plan 20260731-itera-eventos-aprendizagem, Phase 1).
 *
 * Until this shipped, self-paced mode recorded no time at all — `created_at`
 * and nothing else — so "which activity is hard" and "where do learners give
 * up" had no measurement behind them in the mode where most learning happens.
 *
 * The claim these tests defend is the one written into `COMMENT ON COLUMN
 * itera.activity_results.elapsed_ms`: the window opens when the activity appears
 * and CLOSES WHEN THE ANSWER SETTLES — not when the row is written. In this
 * player those are different moments, separated by the learner reading the
 * feedback footer. Nothing in a type or a constraint can catch that boundary
 * moving, which is exactly why it is pinned here.
 */
describe('duration — the attempt row carries how long the learner took', () => {
  const T0 = 5_000_000;
  let clock = T0;
  let nowSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    clock = T0;
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
  });
  afterEach(() => {
    nowSpy?.mockRestore();
    nowSpy = null;
  });

  async function settledRow(): Promise<Record<string, unknown>> {
    await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });
    return inserts['activity_results'][0] as Record<string, unknown>;
  }

  it('measures from the activity appearing to the answer settling', async () => {
    renderPlayer();
    await waitForPlayerReady();

    clock = T0 + 7_000; // the learner thinks for seven seconds…
    fireEvent.click(screen.getByTestId('stub-correct'));
    clock = T0 + 30_000; // …then spends 23s reading the feedback footer.
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    const row = await settledRow();
    // 7s, NOT 30s. The review beat belongs to reading, not to solving; counting
    // it would inflate every graded kind by however long the explanation is.
    expect(row.elapsed_ms).toBe(7_000);
    expect(row.visible_ms).toBe(7_000);
  });

  it('records the time for a MISS too, on the outbox path', async () => {
    renderPlayer();
    await waitForPlayerReady();

    clock = T0 + 4_500;
    fireEvent.click(screen.getByTestId('stub-wrong'));
    clock = T0 + 12_000;
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    const row = await settledRow();
    expect(row.passed).toBe(false);
    // A miss is where duration matters MOST — a wrong answer after four seconds
    // and one after four minutes are different learner behaviours entirely, and
    // before this they were the same row.
    expect(row.elapsed_ms).toBe(4_500);
  });

  it('excludes time the tab spent in the background from visible_ms', async () => {
    const hidden = vi.spyOn(document, 'visibilityState', 'get');
    try {
      hidden.mockReturnValue('visible');
      renderPlayer();
      await waitForPlayerReady();

      clock = T0 + 1_000;
      hidden.mockReturnValue('hidden');
      fireEvent(document, new Event('visibilitychange'));
      clock = T0 + 61_000; // a minute away in another tab
      hidden.mockReturnValue('visible');
      fireEvent(document, new Event('visibilitychange'));

      clock = T0 + 64_000;
      fireEvent.click(screen.getByTestId('stub-correct'));
      fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

      const row = await settledRow();
      // Wall clock keeps the whole minute — it is real and it is a signal.
      expect(row.elapsed_ms).toBe(64_000);
      // Time-on-screen does not: 64s of "difficulty" that was 4s of attention is
      // precisely the lie this second column exists to prevent.
      expect(row.visible_ms).toBe(4_000);
    } finally {
      hidden.mockRestore();
    }
  });
});

/**
 * The deploy-order seatbelt.
 *
 * This app auto-deploys on merge to `main`; no CI applies Itera migrations —
 * they are run by hand. So a window exists where the build knows about
 * `elapsed_ms`/`visible_ms` and the database does not, and PostgREST rejects the
 * WHOLE insert for an unknown column. Untreated, that window silently stops
 * recording attempts entirely — the D2 failure of 2026-07-28 re-created by the
 * telemetry meant to enrich it, and just as unrecoverable afterwards.
 *
 * The rule: telemetry must never be able to destroy the record it decorates.
 */
describe('duration — a schema that lacks the columns must not cost the attempt', () => {
  it('re-inserts the attempt without the timing when the timed insert is rejected', async () => {
    // Exactly what PostgREST answers when the deployed schema predates 0033.
    insertErrorFor = (table, payload) =>
      table === 'activity_results' && 'elapsed_ms' in payload
        ? { message: "column activity_results.elapsed_ms does not exist" }
        : null;

    renderPlayer();
    await waitForPlayerReady();

    fireEvent.click(screen.getByTestId('stub-correct'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    await waitFor(() => expect(inserts['activity_results']?.length).toBe(2), { timeout: 5000 });

    const [timed, fallback] = inserts['activity_results'] as Array<Record<string, unknown>>;
    expect('elapsed_ms' in timed).toBe(true); // the attempt WITH timing was tried first…
    expect('elapsed_ms' in fallback).toBe(false); // …and the retry drops only the timing.
    // The part that actually matters survives intact: the attempt, its real
    // outcome, and what the learner answered.
    expect(fallback.passed).toBe(true);
    expect((fallback.feedback as { response?: string }).response).toBe('A opção certa');
  });

  it('does not double-insert when the timed insert succeeds', async () => {
    renderPlayer();
    await waitForPlayerReady();

    fireEvent.click(screen.getByTestId('stub-correct'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });
    // Give a stray second insert a chance to land before asserting its absence.
    await new Promise((r) => setTimeout(r, 50));
    expect(inserts['activity_results'].length).toBe(1);
  });
});

/**
 * THE ORIGIN RACE — why the duration was intermittently null on `main`.
 *
 * `records the time for a MISS too, on the outbox path` failed sporadically with
 * *"expected null to be 4500"*: not a wrong number, a MISSING one. `duration.
 * read()` returns null only when its origin is null, so the attempt settled in a
 * commit where `activityStartedAt` had not been armed yet.
 *
 * It was armed in a `useEffect` gated on `!resuming`. Effects run AFTER the
 * commit, so there is always one commit in which the activity is on screen,
 * interactive, and the origin is still null — and every handler bound in that
 * commit closes over the null. Whether anything settles inside that window is a
 * scheduling question, which is exactly why it failed by load rather than by
 * logic, and why it never reproduced in isolation (100 local runs, all green).
 *
 * ⚠️ A GATE THAT FAILS BY RACE IS A GATE PEOPLE LEARN TO IGNORE. `progressTruth`
 * is the regression lock for a defect that cost real learner data (D2 — an
 * attempt log that only ever held wins). It has to be believed when it is red.
 *
 * The fix derives the origin DURING RENDER, so the first commit that shows the
 * activity already carries it and the window does not exist. These two cases
 * pin that by settling from the activity's MOUNT EFFECT: child effects flush
 * before the parent's, so this settles inside precisely the commit the race
 * lived in — deterministically, on every run, on every machine. Both FAIL
 * against the pre-fix player with `elapsed_ms: null`.
 */
describe('the duration origin is armed BEFORE the activity can settle', () => {
  const T0 = 9_000_000;
  let clock = T0;
  let nowSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    clock = T0;
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
  });
  afterEach(() => {
    nowSpy?.mockRestore();
    nowSpy = null;
  });

  it('measures an attempt settled in the very commit the activity appears', async () => {
    settleOnMount = { correct: true, response: 'A opção certa' };
    renderPlayer();
    await waitForPlayerReady();
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });
    const row = inserts['activity_results'][0] as Record<string, unknown>;
    // Zero is the honest reading of "settled the instant it opened". NULL is
    // "we never armed the clock", and that is the bug.
    expect(row.elapsed_ms).toBe(0);
  });

  it('anchors the TRACE of such an attempt too, instead of dropping it', async () => {
    // `buildAttemptTrace` returns null without an origin, so the race did not
    // merely lose a number — it lost the whole sequence for that attempt.
    settleOnMount = { correct: false, response: 'O distrator errado' };
    renderPlayer();
    await waitForPlayerReady();
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));

    await waitFor(() => expect(inserts['activity_results']?.length).toBe(1), { timeout: 5000 });
    const trace = upserts.find((u) => u.table === 'activity_traces');
    expect(trace, 'an attempt with no origin writes no trace at all').toBeDefined();
    expect(trace?.payload.started_at).toBe(new Date(T0).toISOString());
  });
});
