import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import LessonPlayer from '@/pages/LessonPlayer';
import type { Activity, ActivityKind } from '@/types/content';

/**
 * LessonPlayer — focused-column width follows the ACTIVITY KIND.
 *
 * A `code` snack is a split pane (Monaco + live preview) nested inside the
 * focused column, so at the prose measure (`max-w-2xl` = 672px) each half is
 * only ~280px and an ordinary JSX starter line wraps 4x — beginners read the
 * wrapping as broken code. Code activities therefore get the wide column; every
 * other kind keeps the prose measure so reading is unaffected.
 */

const useLessonContent = vi.fn();
const useNextLesson = vi.fn();
vi.mock('@/hooks', () => ({
  useLessonContent: (id?: string) => useLessonContent(id),
  useNextLesson: (id?: string) => useNextLesson(id),
}));

vi.mock('@/components/branded/activity/ActivityRenderer', () => ({
  ActivityRenderer: ({ onComplete }: { onComplete: (c: boolean) => void }) => (
    <button data-testid="stub-complete" onClick={() => onComplete(true)}>
      complete
    </button>
  ),
}));

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

function activity(kind: ActivityKind, id = 'a1'): Activity {
  return { id, lessonId: 'lesson-1', ordinal: 1, kind, spec: {}, rubric: null };
}

function mockLesson(...kinds: ActivityKind[]) {
  useLessonContent.mockReturnValue({
    data: {
      id: 'lesson-1',
      title: { pt: 'Componentes' },
      activities: kinds.map((k, i) => activity(k, `a${i + 1}`)),
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
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
  useNextLesson.mockReturnValue({ data: null });
});

describe('LessonPlayer — focused column width by activity kind', () => {
  it('widens the column while a code activity is on screen', () => {
    mockLesson('code');
    renderPlayer();
    const main = screen.getByTestId('lesson-main');
    expect(main.className).toContain('max-w-7xl');
    expect(main.className).not.toContain('max-w-2xl');
  });

  it('keeps the narrow prose column for a quiz activity', () => {
    mockLesson('quiz');
    renderPlayer();
    const main = screen.getByTestId('lesson-main');
    expect(main.className).toContain('max-w-2xl');
    expect(main.className).not.toContain('max-w-7xl');
  });

  it('switches back to the prose column when advancing from code to a quiz', async () => {
    mockLesson('code', 'quiz');
    renderPlayer();
    expect(screen.getByTestId('lesson-main').className).toContain('max-w-7xl');

    // `code` is not a footer-graded kind, so completing advances immediately.
    fireEvent.click(screen.getByTestId('stub-complete'));
    await waitFor(() => expect(screen.getByTestId('lesson-main').className).toContain('max-w-2xl'), {
      timeout: 5000,
    });
    expect(screen.getByTestId('lesson-main').className).not.toContain('max-w-7xl');
  });

  it('returns to the prose column on the completion screen of a code lesson', async () => {
    mockLesson('code');
    renderPlayer();
    fireEvent.click(screen.getByTestId('stub-complete'));
    await waitFor(() => expect(screen.getByTestId('lesson-complete')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId('lesson-main').className).toContain('max-w-2xl');
  });

  it('stays responsive — the column is width-capped, never fixed-width', () => {
    mockLesson('code');
    renderPlayer();
    const main = screen.getByTestId('lesson-main');
    // `w-full` + `max-w-*` = shrink-to-viewport below the cap. A `w-[1280px]`
    // style rule would overflow small screens horizontally.
    expect(main.className).toContain('w-full');
    expect(main.className).not.toMatch(/\bw-\[/);
    expect(main.getAttribute('style')).toBeNull();
  });
});
