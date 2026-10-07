import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LessonPlayer from '@/pages/LessonPlayer';
import type { Activity } from '@/types/content';
import { pageName } from '@/lib/pageTitle';

/**
 * LessonPlayer — round-3 lesson-chrome + end-CTA fixes.
 *
 * Finding #1 (chrome jargon): the eyebrow must be a learner-friendly canonical
 * label ("Lição"), NOT the dropped git metaphor ("PULL · FEATURE/<branch>").
 * Finding #4 (end CTA): the completion screen offers "Próxima lição" routing to
 * the next lesson when one exists, else "Concluir" back to the dashboard.
 *
 * Content hooks are mocked; we drive the player through a single-activity lesson
 * and assert the chrome + CTA. The ActivityRenderer is stubbed to a button that
 * fires onComplete(true); the lesson activity is a GRADED kind ("quiz"), so the
 * submit surfaces the global fixed FeedbackFooter — its "Continuar" CTA is what
 * advances (the Duolingo review-then-continue beat), NOT the submit itself.
 */

const useLessonContent = vi.fn();
const useNextLesson = vi.fn();
const play = vi.fn();
vi.mock('@/hooks/useSoundEffects', () => ({ useSoundEffects: () => ({ play }) }));
const { configured, upsert, progressRows } = vi.hoisted(() => ({
  configured: vi.fn(() => false),
  upsert: vi.fn(),
  progressRows: { current: [] as Array<{ activity_id: string; status: string }> },
}));
vi.mock('@/api/iteraApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/iteraApi')>()),
  iteraApiConfigured: configured,
}));
vi.mock('@/hooks', () => ({
  useLessonContent: (id?: string) => useLessonContent(id),
  useNextLesson: (id?: string) => useNextLesson(id),
}));

// The renderer pulls auth/AI/supabase; stub it to a deterministic complete button.
vi.mock('@/components/branded/activity/ActivityRenderer', () => ({
  ActivityRenderer: ({ activity, onComplete }: { activity: { id: string }; onComplete: (c: boolean) => void }) => (
    <div data-testid="stub-activity" data-activity-id={activity.id}>
      <button data-testid="stub-complete" onClick={() => onComplete(true)}>
        complete
      </button>
      <button data-testid="stub-miss" onClick={() => onComplete(false)}>
        miss
      </button>
    </div>
  ),
}));

// Persist path touches supabase/services. The player gates the success trophy on
// persistProgress() returning TRUE (sibling #32: never celebrate an unsaved
// completion), so the mock must SUCCEED — a chainable stub whose progress upsert
// resolves with no error + a resolved Itera user id.
vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    from: () => {
      // The player now READS itera.progress on mount to resume where the learner
      // stopped, so the stub needs the select→eq→in shape too. It resolves empty:
      // these tests all start a fresh lesson from activity 1.
      const builder: Record<string, unknown> = {
        upsert,
        insert: vi.fn().mockResolvedValue({ error: null }),
        select: () => builder,
        eq: () => builder,
        in: () => Promise.resolve({ data: progressRows.current, error: null }),
      };
      return builder;
    },
  }),
  isSupabaseConfigured: true,
}));
vi.mock('@/services/iteraUser', () => ({ getIteraUserId: vi.fn().mockResolvedValue('itera-user-1') }));
vi.mock('@/services/gamification.service', () => ({ awardActivityXp: vi.fn().mockResolvedValue(undefined) }));

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useParams: () => ({ lessonId: 'lesson-1' }),
  useNavigate: () => vi.fn(),
}));

function lessonData(): { id: string; title: { pt: string }; activities: Activity[] } {
  return {
    id: 'lesson-1',
    title: { pt: 'Pulses (micro-lições)' },
    activities: [
      {
        id: 'a1',
        lessonId: 'lesson-1',
        ordinal: 1,
        kind: 'quiz',
        spec: {},
        rubric: null,
      },
    ],
  };
}

/** First paint waits on the resume read (itera.progress) — await the gate. */
async function waitForPlayerReady() {
  await waitFor(() => expect(screen.queryByTestId('lesson-loading')).toBeNull(), { timeout: 5000 });
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

beforeEach(() => {
  play.mockReset();
  upsert.mockReset();
  progressRows.current = [];
  upsert.mockResolvedValue({ error: null });
  localStorage.clear();
  useLessonContent.mockReset();
  useNextLesson.mockReset();
  configured.mockReturnValue(false);
  useLessonContent.mockReturnValue({ data: lessonData(), isPending: false, isError: false, refetch: vi.fn() });
  useNextLesson.mockReturnValue({ data: null });
});

describe('LessonPlayer — lesson chrome (finding #1)', () => {
  it('renders a learner-friendly "Lição" eyebrow, NOT git jargon', async () => {
    renderPlayer();
    await waitForPlayerReady();
    const eyebrow = screen.getByTestId('lesson-eyebrow');
    expect(eyebrow.textContent ?? '').toMatch(/Lição/i);
    expect(eyebrow.textContent ?? '').not.toMatch(/PULL/);
    expect(eyebrow.textContent ?? '').not.toMatch(/FEATURE\//);
  });

  it('names the page after the lesson while it is open', async () => {
    const { unmount } = renderPlayer();
    await waitForPlayerReady();
    expect(pageName.get()).toBe('Pulses (micro-lições)');
    unmount();
    expect(pageName.get()).toBeNull();
  });

  it('does not render the git branch name anywhere in the chrome', async () => {
    const { container } = renderPlayer();
    await waitForPlayerReady();
    expect(container.textContent ?? '').not.toMatch(/FEATURE\/PULSES/i);
  });
});

describe('LessonPlayer — som ao passar o exercício', () => {
  /**
   * "Quando passa a fase ainda nao tem som": o self-paced era mudo. A guarda
   * precisa ser no player de verdade — um teste do hook isolado continuaria
   * verde se a chamada saísse de `handleComplete`, que é justamente o bug.
   */
  it('toca o som de acerto no instante do veredito, antes do "Continuar"', async () => {
    renderPlayer();
    fireEvent.click(await screen.findByTestId('stub-complete'));
    await screen.findByTestId('feedback-footer-continue');
    expect(play).toHaveBeenCalledWith('success', 0.4);
  });

  it('a cena é muda: settle de xray segura no footer sem tocar acerto', async () => {
    useLessonContent.mockReturnValue({
      data: {
        id: 'lesson-1',
        title: { pt: 'Pulses' },
        activities: [{ id: 'a1', lessonId: 'lesson-1', ordinal: 1, kind: 'xray', spec: {}, rubric: null }],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPlayer();
    fireEvent.click(await screen.findByTestId('stub-complete'));
    await screen.findByTestId('feedback-footer-continue');
    expect(play).not.toHaveBeenCalledWith('success', expect.anything());
    expect(play).not.toHaveBeenCalledWith('error', expect.anything());
  });

  it('comemora ao fechar a última atividade da lição', async () => {
    renderPlayer();
    fireEvent.click(await screen.findByTestId('stub-complete'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    await waitFor(() => expect(screen.getByTestId('lesson-complete')).toBeTruthy(), { timeout: 5000 });
    expect(play).toHaveBeenCalledWith('celebration', 0.5);
  });
});

describe('LessonPlayer — end-of-lesson CTA (finding #4)', () => {
  it('offers "Próxima lição" routing to the next lesson when one exists', async () => {
    useNextLesson.mockReturnValue({ data: { id: 'lesson-2', title: { pt: 'Commit' } } });
    renderPlayer();
    fireEvent.click(await screen.findByTestId('stub-complete'));
    // Graded submit → the fixed feedback footer slides up; "Continuar" advances.
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    // Completion goes through an async persist round-trip; allow generous time
    // for the chained state updates to settle under slower CI runners (the
    // default 1000ms waitFor occasionally races the persist on CI).
    await waitFor(() => expect(screen.getByTestId('lesson-complete')).toBeTruthy(), { timeout: 5000 });
    const cta = screen.getByTestId('lesson-next-cta');
    expect(cta.textContent ?? '').toMatch(/Próxima lição/i);
    expect(cta.getAttribute('href')).toBe('/lesson/lesson-2');
  });

  it('falls back to "Concluir" → dashboard when there is no next lesson', async () => {
    useNextLesson.mockReturnValue({ data: null });
    renderPlayer();
    fireEvent.click(await screen.findByTestId('stub-complete'));
    // Graded submit → the fixed feedback footer slides up; "Continuar" advances.
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    // Completion goes through an async persist round-trip; allow generous time
    // for the chained state updates to settle under slower CI runners (the
    // default 1000ms waitFor occasionally races the persist on CI).
    await waitFor(() => expect(screen.getByTestId('lesson-complete')).toBeTruthy(), { timeout: 5000 });
    const cta = screen.getByTestId('lesson-finish-cta');
    expect(cta.textContent ?? '').toMatch(/Concluir/i);
    expect(cta.getAttribute('href')).toBe('/');
    expect(screen.queryByTestId('lesson-next-cta')).toBeNull();
  });

  it('never shows the old "Descobrir" CTA on the completion screen', async () => {
    renderPlayer();
    fireEvent.click(await screen.findByTestId('stub-complete'));
    // Graded submit → the fixed feedback footer slides up; "Continuar" advances.
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    // Completion goes through an async persist round-trip; allow generous time
    // for the chained state updates to settle under slower CI runners (the
    // default 1000ms waitFor occasionally races the persist on CI).
    await waitFor(() => expect(screen.getByTestId('lesson-complete')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId('lesson-complete').textContent ?? '').not.toMatch(/Descobrir/i);
  });
});

describe('LessonPlayer — concept has no mark-done (reading, not completion)', () => {
  it('renders a plain "Continuar" (no feedback footer) and advances on click', async () => {
    useLessonContent.mockReturnValue({
      data: {
        id: 'lesson-1',
        title: { pt: 'Intro' },
        activities: [
          { id: 'c1', lessonId: 'lesson-1', ordinal: 1, kind: 'concept', spec: { instruction: { text: 'Leia isto.' } }, rubric: null },
          { id: 'a2', lessonId: 'lesson-1', ordinal: 2, kind: 'quiz', spec: {}, rubric: null },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPlayer();
    const cont = await screen.findByTestId('concept-continue');
    expect(cont.textContent ?? '').toMatch(/Continuar/i);
    // A concept is read, not graded — no green/red feedback footer.
    expect(screen.queryByTestId('feedback-footer')).toBeNull();
    // Advancing pages forward to the 2nd activity (not stuck, not completed).
    fireEvent.click(cont);
    await waitFor(() => expect(screen.queryByTestId('concept-continue')).toBeNull(), { timeout: 5000 });
    expect(screen.queryByTestId('lesson-complete')).toBeNull();
  });
});

describe('LessonPlayer — a BYOC layer makes its host kind graded', () => {
  /**
   * BYOC rides on `spec.byoc` over ANY kind, so the shell — not just the
   * renderer — has to know. A `concept` under a harness is answered and graded:
   * it must lose concept's free "Continuar" (which completed it correct without
   * an answer) and gain the graded footer.
   */
  const byocConcept = {
    id: 'c1',
    lessonId: 'lesson-1',
    ordinal: 1,
    kind: 'concept',
    spec: {
      instruction: { text: 'Leia isto.' },
      byoc: {
        seed: { prompt: 'Conte um hobby seu.' },
        harness: { generation_prompt: 'Crie duas versões sobre {seed}.', interaction: 'pick_best' },
      },
    },
    rubric: null,
  };

  beforeEach(() => {
    configured.mockReturnValue(true);
    useLessonContent.mockReturnValue({
      data: {
        id: 'lesson-1',
        title: { pt: 'Intro' },
        activities: [byocConcept, { id: 'a2', lessonId: 'lesson-1', ordinal: 2, kind: 'quiz', spec: {}, rubric: null }],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('drops the free "Continuar" that would complete it without an answer', async () => {
    renderPlayer();
    // Wait for the resume gate first, or the absence below is trivially true
    // because the player is still showing the loading skeleton.
    await waitForPlayerReady();
    expect(screen.queryByTestId('concept-continue')).toBeNull();
  });

  it('holds on the graded footer instead of auto-advancing', async () => {
    renderPlayer();
    fireEvent.click(await screen.findByTestId('stub-complete'));
    expect((await screen.findByTestId('feedback-footer')).getAttribute('data-correct')).toBe('true');
  });

  it('keeps the plain "Continuar" when the itera-api is not configured', async () => {
    configured.mockReturnValue(false);
    renderPlayer();
    expect(await screen.findByTestId('concept-continue')).toBeTruthy();
  });
});

describe('LessonPlayer — global feedback footer (Duolingo pattern)', () => {
  it('holds on the activity showing the fixed footer after a graded submit — does NOT auto-advance', async () => {
    // Two-activity lesson so "advance" is observable (index moves, not complete).
    useLessonContent.mockReturnValue({
      data: {
        id: 'lesson-1',
        title: { pt: 'Pulses' },
        activities: [
          { id: 'a1', lessonId: 'lesson-1', ordinal: 1, kind: 'quiz', spec: {}, rubric: null },
          { id: 'a2', lessonId: 'lesson-1', ordinal: 2, kind: 'quiz', spec: {}, rubric: null },
        ],
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPlayer();
    fireEvent.click(await screen.findByTestId('stub-complete'));
    // The footer appears; the lesson has NOT completed and did not skip ahead.
    const footer = await screen.findByTestId('feedback-footer');
    expect(footer.getAttribute('data-correct')).toBe('true');
    expect(screen.queryByTestId('lesson-complete')).toBeNull();
    // Continue advances to the 2nd activity → the stub re-mounts (still present),
    // and the footer is cleared for the fresh activity.
    fireEvent.click(screen.getByTestId('feedback-footer-continue'));
    await waitFor(() => expect(screen.queryByTestId('feedback-footer')).toBeNull(), { timeout: 5000 });
    expect(screen.getByTestId('stub-complete')).toBeTruthy();
    expect(screen.queryByTestId('lesson-complete')).toBeNull();
  });
});

describe('LessonPlayer — forward navigation to where the learner stopped', () => {
  function conceptLesson(count: number) {
    return {
      data: {
        id: 'lesson-1',
        title: { pt: 'Intro' },
        activities: Array.from({ length: count }, (_, i) => ({
          id: `c${i + 1}`,
          lessonId: 'lesson-1',
          ordinal: i + 1,
          kind: 'concept',
          spec: { instruction: { text: `Leia ${i + 1}.` } },
          rubric: null,
        })),
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
  }

  async function advanceConcept() {
    fireEvent.click(await screen.findByTestId('concept-continue'));
  }

  it('shows the forward arrow disabled at the frontier', async () => {
    useLessonContent.mockReturnValue(conceptLesson(4));
    renderPlayer();
    const next = (await screen.findByTestId('lesson-next')) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(screen.queryByTestId('lesson-jump-current')).toBeNull();
  });

  it('does not render the forward arrow on a single-activity lesson', async () => {
    renderPlayer();
    await waitForPlayerReady();
    expect(screen.queryByTestId('lesson-next')).toBeNull();
  });

  it('returns forward after stepping back without writing progress', async () => {
    useLessonContent.mockReturnValue(conceptLesson(4));
    renderPlayer();
    await advanceConcept();
    await waitFor(() => expect(screen.getByTestId('lesson-prev')).toBeTruthy());
    await waitFor(() => expect((screen.getByTestId('lesson-next') as HTMLButtonElement).disabled).toBe(true));
    const writesBefore = upsert.mock.calls.length;

    fireEvent.click(screen.getByTestId('lesson-prev'));
    const next = (await screen.findByTestId('lesson-next')) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    expect(screen.getByTestId('lesson-progress-frontier')).toBeTruthy();

    fireEvent.click(next);
    await waitFor(() => expect((screen.getByTestId('lesson-next') as HTMLButtonElement).disabled).toBe(true));
    expect(screen.queryByTestId('lesson-progress-frontier')).toBeNull();
    expect(screen.queryByTestId('lesson-complete')).toBeNull();
    expect(upsert.mock.calls.length).toBe(writesBefore);
  });

  it('offers the jump pill only when two or more behind, landing on the furthest activity reached', async () => {
    useLessonContent.mockReturnValue(conceptLesson(5));
    renderPlayer();
    await advanceConcept();
    await waitFor(() => expect(screen.getByTestId('lesson-prev')).toBeTruthy());
    await advanceConcept();
    await waitFor(() => expect(screen.getByTestId('lesson-progress')).toBeTruthy());
    await waitFor(() =>
      expect(screen.getByTestId('lesson-progress').getAttribute('aria-valuenow')).toBe('40')
    );

    fireEvent.click(screen.getByTestId('lesson-prev'));
    await waitFor(() =>
      expect(screen.getByTestId('lesson-progress').getAttribute('aria-valuenow')).toBe('20')
    );
    expect(screen.queryByTestId('lesson-jump-current')).toBeNull();

    fireEvent.click(screen.getByTestId('lesson-prev'));
    await waitFor(() =>
      expect(screen.getByTestId('lesson-progress').getAttribute('aria-valuenow')).toBe('0')
    );
    const writesBefore = upsert.mock.calls.length;
    expect(screen.getByTestId('lesson-jump-current')).toBeTruthy();
    fireEvent.click(screen.getByTestId('lesson-jump-current'));
    await waitFor(() =>
      expect(screen.getByTestId('lesson-progress').getAttribute('aria-valuenow')).toBe('40')
    );
    expect(screen.queryByTestId('lesson-jump-current')).toBeNull();
    expect((screen.getByTestId('lesson-next') as HTMLButtonElement).disabled).toBe(true);
    expect(upsert.mock.calls.length).toBe(writesBefore);
  });

  it('hides the jump pill when only one step behind', async () => {
    useLessonContent.mockReturnValue(conceptLesson(4));
    renderPlayer();
    await advanceConcept();
    await waitFor(() => expect(screen.getByTestId('lesson-prev')).toBeTruthy());
    fireEvent.click(screen.getByTestId('lesson-prev'));
    await screen.findByTestId('lesson-progress-frontier');
    expect(screen.queryByTestId('lesson-jump-current')).toBeNull();
  });

  function quizLesson(count: number) {
    return {
      data: {
        id: 'lesson-1',
        title: { pt: 'Quiz' },
        activities: Array.from({ length: count }, (_, i) => ({
          id: `q${i + 1}`,
          lessonId: 'lesson-1',
          ordinal: i + 1,
          kind: 'quiz',
          spec: {},
          rubric: null,
        })),
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    };
  }

  const shownId = () => screen.getByTestId('stub-activity').getAttribute('data-activity-id');
  const nextDisabled = () => (screen.getByTestId('lesson-next') as HTMLButtonElement).disabled;

  it('keeps the forward arrow usable after a MISSED answer advanced', async () => {
    useLessonContent.mockReturnValue(quizLesson(3));
    renderPlayer();
    fireEvent.click(await screen.findByTestId('stub-miss'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    await waitFor(() => expect(shownId()).toBe('q2'));
    expect(nextDisabled()).toBe(true);

    fireEvent.click(screen.getByTestId('lesson-prev'));
    await waitFor(() => expect(shownId()).toBe('q1'));
    expect(nextDisabled()).toBe(false);
    const writesBefore = upsert.mock.calls.length;
    fireEvent.click(screen.getByTestId('lesson-next'));
    await waitFor(() => expect(shownId()).toBe('q2'));
    expect(nextDisabled()).toBe(true);
    expect(upsert.mock.calls.length).toBe(writesBefore);
  });

  it('resumed at activity N: forward is disabled on landing, enabled after one step back', async () => {
    progressRows.current = [
      { activity_id: 'q1', status: 'completed' },
      { activity_id: 'q2', status: 'completed' },
    ];
    useLessonContent.mockReturnValue(quizLesson(4));
    configured.mockReturnValue(false);
    renderPlayer();
    await waitFor(() => expect(shownId()).toBe('q3'));
    expect(nextDisabled()).toBe(true);

    fireEvent.click(screen.getByTestId('lesson-prev'));
    await waitFor(() => expect(shownId()).toBe('q2'));
    expect(nextDisabled()).toBe(false);
    fireEvent.click(screen.getByTestId('lesson-next'));
    await waitFor(() => expect(shownId()).toBe('q3'));
    expect(nextDisabled()).toBe(true);
  });

  it('after finishing, forward from the last activity returns to the completion screen', async () => {
    useLessonContent.mockReturnValue(quizLesson(2));
    renderPlayer();
    fireEvent.click(await screen.findByTestId('stub-complete'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    await waitFor(() => expect(shownId()).toBe('q2'));
    expect(nextDisabled()).toBe(true);
    fireEvent.click(screen.getByTestId('stub-complete'));
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    await screen.findByTestId('lesson-complete');

    fireEvent.click(screen.getByTestId('lesson-prev'));
    await waitFor(() => expect(shownId()).toBe('q2'));
    expect(nextDisabled()).toBe(false);
    fireEvent.click(screen.getByTestId('lesson-next'));
    await screen.findByTestId('lesson-complete');
  });

  it('a lesson resumed into the completion screen can step back and forward to it again', async () => {
    progressRows.current = [
      { activity_id: 'q1', status: 'completed' },
      { activity_id: 'q2', status: 'completed' },
    ];
    useLessonContent.mockReturnValue(quizLesson(2));
    renderPlayer();
    await screen.findByTestId('lesson-complete');
    fireEvent.click(screen.getByTestId('lesson-prev'));
    await waitFor(() => expect(shownId()).toBe('q2'));
    expect(nextDisabled()).toBe(false);
  });

  it('blocks forward and the jump pill while the footer is up, and restores them after Continue', async () => {
    useLessonContent.mockReturnValue(quizLesson(5));
    renderPlayer();
    for (let i = 0; i < 3; i++) {
      fireEvent.click(await screen.findByTestId('stub-miss'));
      fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
      await waitFor(() => expect(shownId()).toBe(`q${i + 2}`));
    }
    fireEvent.click(screen.getByTestId('lesson-prev'));
    fireEvent.click(await screen.findByTestId('lesson-prev'));
    await waitFor(() => expect(shownId()).toBe('q2'));
    expect(screen.getByTestId('lesson-jump-current')).toBeTruthy();

    // q2 was missed: it stands until the learner asks for another try.
    fireEvent.click(screen.getByTestId('lesson-retry-missed'));
    fireEvent.click(screen.getByTestId('stub-miss'));
    await screen.findByTestId('feedback-footer');
    expect(nextDisabled()).toBe(true);
    expect(screen.queryByTestId('lesson-jump-current')).toBeNull();

    fireEvent.click(screen.getByTestId('feedback-footer-continue'));
    await waitFor(() => expect(shownId()).toBe('q3'));
    expect(nextDisabled()).toBe(false);
    await waitFor(() => expect(screen.queryByTestId('feedback-footer')).toBeNull(), { timeout: 5000 });
  });
});
