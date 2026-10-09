import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import CoursePage from '@/pages/CoursePage';
import type { VideoCourse } from '@/types/videoCourses';

const useVideoCourses = vi.fn();
const mutate = vi.fn();
vi.mock('@/hooks/useVideoCourses', () => ({
  useVideoCourses: () => useVideoCourses(),
  useToggleWatched: () => ({ mutate, reset: vi.fn(), isError: false }),
}));
vi.mock('@/components/courses/CoursesShell', () => ({ CoursesShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const react: VideoCourse = {
  id: 'r',
  slug: 'react',
  title: 'React',
  description: '',
  thumbnailUrl: null,
  teacherName: 'Alexandre',
  teacherAvatarUrl: null,
  position: 1,
  lessons: ['r1', 'r2', 'r3'].map((id, i) => ({ id, courseId: 'r', title: `Video ${id}`, description: `About ${id}`, videoUrl: `https://www.youtube.com/embed/${id}`, durationSeconds: 125, position: i + 1 })),
};

const ready = (progress: [string, number][], courses = [react]) =>
  useVideoCourses.mockReturnValue({ courses, progress: new Map(progress), isPending: false, isError: false, refetch: vi.fn() });

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + loc.search}</output>;
}

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <I18nProvider>
        <Routes>
          <Route path="/course/:slug" element={<><CoursePage /><Where /></>} />
          <Route path="/catalog" element={<Where />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  useVideoCourses.mockReset();
  mutate.mockReset();
});

describe('CoursePage', () => {
  it('opens the first unwatched video and embeds it safely', () => {
    ready([['r1', 1]]);
    renderAt('/course/react');
    const frame = screen.getByTitle(/React — Video r2/);
    expect(frame).toHaveAttribute('src', expect.stringContaining('/embed/r2'));
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    expect(frame).toHaveAttribute('allowfullscreen');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Video r2');
  });

  it('honors ?v= and marks the current playlist row', () => {
    ready([]);
    renderAt('/course/react?v=r3');
    const rows = screen.getAllByTestId('playlist-row');
    expect(rows[2]).toHaveAttribute('aria-current', 'true');
    expect(rows[0]).not.toHaveAttribute('aria-current');
    expect(rows[0]).toHaveTextContent('2:05');
  });

  it('selecting a row puts it in the URL', () => {
    ready([]);
    renderAt('/course/react');
    fireEvent.click(screen.getAllByTestId('playlist-row')[1]);
    expect(screen.getByTestId('where')).toHaveTextContent('/course/react?v=r2');
  });

  it('marks watched, then moves to the next video', () => {
    ready([]);
    renderAt('/course/react?v=r1');
    fireEvent.click(screen.getByTestId('mark-watched'));
    expect(mutate).toHaveBeenCalledWith({ lessonId: 'r1', watched: true });
    expect(screen.getByTestId('where')).toHaveTextContent('?v=r2');
  });

  it('unmarks a watched video without moving', () => {
    ready([['r1', 1]]);
    renderAt('/course/react?v=r1');
    fireEvent.click(screen.getByTestId('mark-watched'));
    expect(mutate).toHaveBeenCalledWith({ lessonId: 'r1', watched: false });
    expect(screen.getByTestId('where')).toHaveTextContent('?v=r1');
  });

  it('disables next on the last video', () => {
    ready([]);
    renderAt('/course/react?v=r3');
    expect(screen.getByTestId('next-video')).toBeDisabled();
  });

  it('shows the teacher with a course count only when they teach more', () => {
    ready([], [react, { ...react, id: 'r2c', slug: 'r2c' }]);
    renderAt('/course/react');
    expect(within(screen.getByTestId('teacher-card')).getByText('2 cursos')).toBeInTheDocument();
  });

  it('shows not-found for an unknown slug and goes back to the catalog', () => {
    ready([]);
    renderAt('/course/nope');
    fireEvent.click(within(screen.getByTestId('course-not-found')).getByRole('button'));
    expect(screen.getByTestId('where')).toHaveTextContent('/catalog');
  });
});
