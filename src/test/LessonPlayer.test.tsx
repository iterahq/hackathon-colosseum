import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LessonPlayer from '@/pages/LessonPlayer';
import type { Activity } from '@/types/content';

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
vi.mock('@/hooks', () => ({
  useLessonContent: (id?: string) => useLessonContent(id),
  useNextLesson: (id?: string) => useNextLesson(id),
}));

// The renderer pulls auth/AI/supabase; stub it to a deterministic complete button.
vi.mock('@/components/branded/activity/ActivityRenderer', () => ({
  ActivityRenderer: ({ onComplete }: { onComplete: (c: boolean) => void }) => (
    <button data-testid="stub-complete" onClick={() => onComplete(true)}>
      complete
    </button>
  ),
}));

// Persist path touches supabase/services. The player gates the success trophy on
// persistProgress() returning TRUE (sibling #32: never celebrate an unsaved
// completion), so the mock must SUCCEED — a chainable stub whose progress upsert
// resolves with no error + a resolved Itera user id.
vi.mock('@/lib/supabase/client', () => ({
  getSupabase: () => ({
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
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
  useLessonContent.mockReset();
  useNextLesson.mockReset();
  useLessonContent.mockReturnValue({ data: lessonData(), isPending: false, isError: false, refetch: vi.fn() });
  useNextLesson.mockReturnValue({ data: null });
});

describe('LessonPlayer — lesson chrome (finding #1)', () => {
  it('renders a learner-friendly "Lição" eyebrow, NOT git jargon', () => {
    renderPlayer();
    const eyebrow = screen.getByTestId('lesson-eyebrow');
    expect(eyebrow.textContent ?? '').toMatch(/Lição/i);
    expect(eyebrow.textContent ?? '').not.toMatch(/PULL/);
    expect(eyebrow.textContent ?? '').not.toMatch(/FEATURE\//);
  });

  it('does not render the git branch name anywhere in the chrome', () => {
    const { container } = renderPlayer();
    expect(container.textContent ?? '').not.toMatch(/FEATURE\/PULSES/i);
  });
});

describe('LessonPlayer — end-of-lesson CTA (finding #4)', () => {
  it('offers "Próxima lição" routing to the next lesson when one exists', async () => {
    useNextLesson.mockReturnValue({ data: { id: 'lesson-2', title: { pt: 'Commit' } } });
    renderPlayer();
    fireEvent.click(screen.getByTestId('stub-complete'));
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
    fireEvent.click(screen.getByTestId('stub-complete'));
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
    fireEvent.click(screen.getByTestId('stub-complete'));
    // Graded submit → the fixed feedback footer slides up; "Continuar" advances.
    fireEvent.click(await screen.findByTestId('feedback-footer-continue'));
    // Completion goes through an async persist round-trip; allow generous time
    // for the chained state updates to settle under slower CI runners (the
    // default 1000ms waitFor occasionally races the persist on CI).
    await waitFor(() => expect(screen.getByTestId('lesson-complete')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId('lesson-complete').textContent ?? '').not.toMatch(/Descobrir/i);
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
    fireEvent.click(screen.getByTestId('stub-complete'));
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
