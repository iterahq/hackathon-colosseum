import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '@/i18n';
import CatalogRoute from '@/pages/CatalogRoute';
import type { Course } from '@/utils/courses';

/** The "Cursos" page: the courses hook is stubbed and the real cards, filters and enroll flow render. */

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig<typeof import('react-router-dom')>()), useNavigate: () => navigate }));

const enrollInProgram = vi.fn();
vi.mock('@/hooks/useCatalog', async (orig) => ({ ...(await orig<typeof import('@/hooks/useCatalog')>()) }));
vi.mock('@/services/catalog.service', () => ({ getCatalogPrograms: vi.fn(), enrollInProgram: (id: string) => enrollInProgram(id) }));

const useCourses = vi.fn();
vi.mock('@/hooks/useCourses', () => ({ useCourses: () => useCourses() }));
vi.mock('@/components/courses/CoursesShell', () => ({ CoursesShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const course = (over: Partial<Course> = {}): Course => ({
  id: 'c1',
  slug: 'itera-v2',
  title: { pt: 'Itera v2 — Básico' },
  origin: 'catalog',
  enrolled: true,
  units: 2,
  lessons: 5,
  activities: 10,
  doneLessons: 0,
  doneActivities: 0,
  state: 'new',
  lastProgressAt: null,
  dots: ['current', 'locked'],
  resumeLessonId: null,
  ...over,
});

const ready = (courses: Course[], extra: Record<string, unknown> = {}) =>
  useCourses.mockReturnValue({ courses, visitor: false, isPending: false, isError: false, refetch: vi.fn(), ...extra });

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <I18nProvider>
          <CatalogRoute />
        </I18nProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigate.mockReset();
  enrollInProgram.mockReset();
});

describe('CatalogRoute', () => {
  it('shows the prompt line, the headline and the featured in-progress course with Continuar', () => {
    ready([course({ id: 'a', slug: 'a', state: 'new' }), course({ id: 'b', slug: 'b', state: 'in_progress', doneActivities: 4, resumeLessonId: 'l9', lastProgressAt: 5 })]);
    renderPage();
    expect(screen.getByText('> cursos · 2 disponíveis')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cursos' })).toBeInTheDocument();
    expect(screen.getByTestId('featured-course-cta')).toHaveTextContent('Continuar');
    expect(screen.getByTestId('featured-course-cta')).toHaveAttribute('href', '/lesson/l9');
  });

  it('filters the grid by state and shows counts on the chips', () => {
    ready([course({ id: 'a', slug: 'a' }), course({ id: 'b', slug: 'b', state: 'done', doneActivities: 10 }), course({ id: 'c', slug: 'c', state: 'in_progress', doneActivities: 1, lastProgressAt: 1 })]);
    renderPage();
    expect(screen.getAllByTestId('course-card')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Concluídos/ })).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: /Concluídos/ }));
    expect(screen.getAllByTestId('course-card').map((c) => c.dataset.state)).toEqual(['done']);
    fireEvent.click(screen.getByRole('button', { name: /Em andamento/ }));
    expect(screen.getAllByTestId('course-card').map((c) => c.dataset.state)).toEqual(['in_progress']);
  });

  it('every card links to its program and carries its origin tag', () => {
    ready([course({ origin: 'cohort' })]);
    renderPage();
    expect(screen.getByRole('link', { name: 'Itera v2 — Básico' })).toHaveAttribute('href', '/program/itera-v2');
    expect(screen.getByTestId('course-card')).toHaveTextContent('sua turma');
  });

  it('enrolls in a course the learner has not joined, then opens it', async () => {
    enrollInProgram.mockResolvedValueOnce({ tenantId: 't', role: 'learner', enrolled: true });
    ready([course({ enrolled: false })]);
    renderPage();
    fireEvent.click(screen.getAllByTestId('course-enroll')[0]);
    await waitFor(() => expect(enrollInProgram).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/program/itera-v2'));
  });

  it('shows the error on that course and stays when enrollment fails', async () => {
    enrollInProgram.mockRejectedValueOnce(new Error('rpc'));
    ready([course({ enrolled: false })]);
    renderPage();
    fireEvent.click(screen.getAllByTestId('course-enroll')[0]);
    await screen.findByTestId('course-enroll-error');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('never offers Enroll to a visitor', () => {
    ready([course({ enrolled: false })], { visitor: true });
    renderPage();
    expect(screen.queryByTestId('course-enroll')).toBeNull();
    expect(screen.getByTestId('featured-course-cta')).toHaveAttribute('href', '/program/itera-v2');
  });

  it('renders loading, empty and error states', () => {
    const refetch = vi.fn();
    ready([], { isPending: true });
    const { unmount } = renderPage();
    expect(screen.getByTestId('courses-loading')).toBeInTheDocument();
    unmount();
    ready([]);
    const second = renderPage();
    expect(screen.getByTestId('courses-empty')).toBeInTheDocument();
    second.unmount();
    ready([], { isError: true, refetch });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
