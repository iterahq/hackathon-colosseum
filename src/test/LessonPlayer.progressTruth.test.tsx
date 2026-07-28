import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LessonPlayer from '@/pages/LessonPlayer';
import {
  buildAttemptFeedback,
  resumeIndexFor,
  MAX_RESPONSE_CHARS,
} from '@/services/progress.service';
import type { Activity } from '@/types/content';

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
let progressRows: Array<{ activity_id: string; status: string }> = [];

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
vi.mock('@/components/branded/activity/ActivityRenderer', () => ({
  ActivityRenderer: ({
    onComplete,
  }: {
    onComplete: (c: boolean, detail?: { response?: string }) => void;
  }) => (
    <>
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
  ),
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
          return Promise.resolve({ error: null });
        },
        select: () => builder,
        eq: () => builder,
        in: () => Promise.resolve({ data: table === 'progress' ? progressRows : [], error: null }),
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
  for (const k of Object.keys(inserts)) delete inserts[k];
  upserts.length = 0;
  progressRows = [];
  // Module-level mock: without clearing, call counts accumulate across cases in
  // this file and the "no XP for a miss" assertion sees an earlier test's award.
  const { awardActivityXp } = await import('@/services/gamification.service');
  vi.mocked(awardActivityXp).mockClear();
  useLessonContent.mockReset();
  useNextLesson.mockReset();
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

  it('returns the length when the whole lesson is done', () => {
    expect(resumeIndexFor(ids, { a1: 'completed', a2: 'completed', a3: 'completed' })).toBe(3);
  });
});
