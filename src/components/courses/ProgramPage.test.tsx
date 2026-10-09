import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from '@/i18n';
import ProgramPage from '@/pages/ProgramPage';

const act = (id: string, status?: string) => ({ id, lessonId: 'l', ordinal: 1, kind: 'document', spec: {}, rubric: null, status });
const program = {
  id: 'p',
  tenantId: 't',
  slug: 'html',
  title: { pt: 'HTML do zero' },
  createdAt: '2026-01-01T00:00:00Z',
  units: [
    {
      id: 'u1',
      programId: 'p',
      ordinal: 1,
      title: { pt: 'Semana 1 · HTML' },
      lessons: [
        { id: 'l1', unitId: 'u1', ordinal: 1, title: { pt: 'Dia 1 — Base' }, activities: [act('a1', 'done')] },
        { id: 'l2', unitId: 'u1', ordinal: 2, title: { pt: 'Dia 2 — Tags' }, activities: [act('a2')] },
        { id: 'l3', unitId: 'u1', ordinal: 3, title: { pt: 'Dia 3 — Forms' }, activities: [act('a3')] },
      ],
    },
    { id: 'u2', programId: 'p', ordinal: 2, title: { pt: 'Semana 2 · CSS' }, lessons: [{ id: 'l4', unitId: 'u2', ordinal: 1, title: { pt: 'Dia 1' }, activities: [act('a4')] }] },
  ],
};

vi.mock('@/hooks/useAccessLevel', () => ({ useAccessLevel: () => ({ level: 'member', entitlementError: false }) }));
vi.mock('@/hooks', () => ({ useProgram: () => ({ data: program, isPending: false, isError: false, error: null, refetch: vi.fn() }) }));
vi.mock('@/hooks/useCatalog', () => ({ useCatalog: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }) }));
vi.mock('@/components/courses/CoursesShell', () => ({ CoursesShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/program/html']}>
      <I18nProvider>
        <Routes>
          <Route path="/program/:slug" element={<ProgramPage />} />
        </Routes>
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe('ProgramPage trails', () => {
  it('shows the hero counts and one section per unit', () => {
    renderPage();
    expect(screen.getByTestId('program-counts')).toHaveTextContent('2 trilhas · 4 dias');
    expect(screen.getAllByTestId('program-trail').map((s) => s.dataset.status)).toEqual(['in_progress', 'locked']);
  });

  it('opens done and current days as lesson links and keeps the rest locked', () => {
    renderPage();
    const done = screen.getByTestId('tree-node-done');
    const current = screen.getByTestId('tree-node-current');
    expect(done).toHaveAttribute('href', '/lesson/l1');
    expect(current).toHaveAttribute('href', '/lesson/l2');
    const locked = screen.getAllByTestId('tree-node-locked');
    expect(locked).toHaveLength(2);
    locked.forEach((node) => expect(node.tagName).not.toBe('A'));
    expect(locked[0]).toHaveTextContent('Conclua o Dia 2 para liberar');
  });

  it('gives each unfinished trail a section id and a primary button', () => {
    renderPage();
    const [first, second] = screen.getAllByTestId('program-trail');
    expect(first).toHaveAttribute('id', 'trail-u1');
    expect(within(first).getByTestId('trail-cta')).toHaveTextContent('Continuar trilha');
    expect(within(first).getByTestId('trail-cta')).toHaveAttribute('href', '/lesson/l2');
    expect(within(second).getByTestId('trail-cta')).toBeDisabled();
    expect(within(second).getByTestId('trail-cta')).toHaveTextContent('libera após HTML');
  });

  it('continues into the current lesson from the hero', () => {
    renderPage();
    expect(screen.getByTestId('program-continue')).toHaveAttribute('href', '/lesson/l2');
  });
});
