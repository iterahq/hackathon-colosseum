import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import CatalogRoute from '@/pages/CatalogRoute';
import type { VideoCourse } from '@/types/videoCourses';

const useVideoCourses = vi.fn();
vi.mock('@/hooks/useVideoCourses', () => ({ useVideoCourses: () => useVideoCourses() }));
vi.mock('@/components/courses/CoursesShell', () => ({ CoursesShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const course = (slug: string, position: number, ids: string[]): VideoCourse => ({
  id: slug,
  slug,
  title: `Course ${slug}`,
  description: '',
  thumbnailUrl: null,
  teacherName: 'Ana Lima',
  teacherAvatarUrl: null,
  position,
  lessons: ids.map((id, i) => ({ id, courseId: slug, title: id, description: '', videoUrl: `https://www.youtube.com/embed/${id}`, durationSeconds: 600, position: i + 1 })),
});

const courses = [course('a', 1, ['a1', 'a2']), course('b', 2, ['b1', 'b2']), course('c', 3, ['c1'])];
const ready = (progress: [string, number][], extra: Record<string, unknown> = {}) =>
  useVideoCourses.mockReturnValue({ courses, progress: new Map(progress), isPending: false, isError: false, refetch: vi.fn(), ...extra });

const renderPage = () =>
  render(
    <MemoryRouter>
      <I18nProvider>
        <CatalogRoute />
      </I18nProvider>
    </MemoryRouter>,
  );

beforeEach(() => useVideoCourses.mockReset());

describe('CatalogRoute', () => {
  it('lists every course as a link to its course page', () => {
    ready([]);
    renderPage();
    const cards = screen.getAllByTestId('course-card');
    expect(cards).toHaveLength(3);
    expect(within(cards[1]).getByRole('link')).toHaveAttribute('href', '/course/b');
  });

  it('features the course in progress that was watched last', () => {
    ready([['a1', 10], ['b1', 50]]);
    renderPage();
    const hero = screen.getByTestId('featured-course');
    expect(within(hero).getByRole('heading', { name: 'Course b' })).toBeInTheDocument();
    expect(within(hero).getByTestId('featured-course-cta')).toHaveAttribute('href', '/course/b');
  });

  it('shows the thumbnail fallback glyph when there is no image', () => {
    ready([]);
    renderPage();
    expect(screen.getAllByTestId('thumb-fallback').length).toBeGreaterThan(0);
  });

  it('filters by progress state with counts', () => {
    ready([['c1', 5], ['a1', 4]]);
    renderPage();
    const filters = screen.getByTestId('course-filters');
    expect(within(filters).getByRole('button', { name: /Concluídos/ })).toHaveTextContent('1');
    fireEvent.click(within(filters).getByRole('button', { name: /Não iniciados/ }));
    const cards = screen.getAllByTestId('course-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute('data-state', 'new');
  });

  it('offers a way back from an empty filter', () => {
    ready([]);
    renderPage();
    fireEvent.click(within(screen.getByTestId('course-filters')).getByRole('button', { name: /Concluídos/ }));
    fireEvent.click(within(screen.getByTestId('courses-filtered')).getByRole('button'));
    expect(screen.getAllByTestId('course-card')).toHaveLength(3);
  });

  it('shows the error state and retries', () => {
    const refetch = vi.fn();
    ready([], { isError: true, refetch });
    renderPage();
    fireEvent.click(within(screen.getByTestId('courses-error')).getByRole('button'));
    expect(refetch).toHaveBeenCalled();
  });
});
