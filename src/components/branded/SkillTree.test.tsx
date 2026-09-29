import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { SkillTree } from './SkillTree';
import { UNIT_PALETTE } from './skillTreeUnitPalette';
import type { ProgramDetail, Activity } from '@/types/content';

const act = (id: string, status: Activity['status']): Activity => ({
  id,
  lessonId: 'l',
  ordinal: 0,
  kind: 'document',
  spec: {},
  rubric: null,
  status,
});

const program: ProgramDetail = {
  id: 'p1',
  tenantId: 't1',
  slug: 'agentic-fluency',
  title: { en: 'Agentic Fluency' },
  createdAt: new Date().toISOString(),
  icon: 'code',
  units: [
    {
      id: 'u1',
      programId: 'p1',
      ordinal: 0,
      title: { en: 'Process to diagram' },
      lessons: [{ id: 'l1', unitId: 'u1', ordinal: 0, title: { en: 'Lesson 1' }, activities: [act('a1', 'todo')] }],
    },
    {
      id: 'u2',
      programId: 'p1',
      ordinal: 1,
      title: { en: 'Diagram to decision model' },
      lessons: [{ id: 'l2', unitId: 'u2', ordinal: 0, title: { en: 'Lesson 2' }, activities: [act('a2', 'todo')] }],
    },
    {
      id: 'u3',
      programId: 'p1',
      ordinal: 2,
      title: { en: 'Decision model to agent' },
      lessons: [{ id: 'l3', unitId: 'u3', ordinal: 0, title: { en: 'Lesson 3' }, activities: [act('a3', 'todo')] }],
    },
  ],
};

function renderTree() {
  return render(
    <I18nProvider>
      <SkillTree program={program} onOpenLesson={() => {}} />
    </I18nProvider>
  );
}

describe('SkillTree', () => {
  it('shows a "Semana N" eyebrow per unit (default pt locale), one week per unit in order', () => {
    renderTree();
    expect(screen.getByText('Semana 1')).toBeInTheDocument();
    expect(screen.getByText('Semana 2')).toBeInTheDocument();
    expect(screen.getByText('Semana 3')).toBeInTheDocument();
  });

  it('renders each unit banner as a solid card in a palette tone, cycling by unit index', () => {
    renderTree();
    screen.getAllByTestId('unit-banner').forEach((banner, i) => {
      expect(banner).toHaveStyle({ backgroundColor: UNIT_PALETTE[i % UNIT_PALETTE.length].base });
    });
  });

  it('shows a continuous day number, the lesson title and the kind label under each node', () => {
    renderTree();
    expect(screen.getByText('Dia 1')).toBeInTheDocument();
    expect(screen.getByText('Dia 3')).toBeInTheDocument();
    expect(screen.getAllByText('Lesson 1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Documento').length).toBe(3);
  });

  it('renders the callout only for the first current node and opens its lesson', () => {
    const onOpenLesson = vi.fn();
    render(
      <I18nProvider>
        <SkillTree program={program} onOpenLesson={onOpenLesson} />
      </I18nProvider>
    );
    const callouts = screen.getAllByTestId('tree-callout');
    expect(callouts).toHaveLength(1);
    fireEvent.click(within(callouts[0]).getByRole('button'));
    expect(onOpenLesson).toHaveBeenCalledWith('l1');
    expect(within(callouts[0]).getByText('> dia 01 · lição 1 de 1')).toBeInTheDocument();
  });

  it('keeps the current node interactive and the locked node non-interactive', () => {
    renderTree();
    const current = screen.getAllByTestId('tree-node-current')[0];
    expect(current).not.toBeDisabled();
  });

  it('keeps the done/total progress count per unit', () => {
    renderTree();
    const progress = (_content: string, element: Element | null) =>
      element?.textContent === '0/1';
    expect(screen.getAllByText(progress).length).toBe(3);
  });

  it('opens a lesson only for an unlocked node', () => {
    const onOpenLesson = vi.fn();
    render(
      <I18nProvider>
        <SkillTree program={program} onOpenLesson={onOpenLesson} />
      </I18nProvider>
    );
    screen.getAllByTestId('tree-node-current')[0].click();
    expect(onOpenLesson).toHaveBeenCalledWith('l1');
  });
});
