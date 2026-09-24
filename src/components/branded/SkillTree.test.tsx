import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('assigns each unit a color from the palette, cycling by unit index', () => {
    renderTree();
    const eyebrows = [screen.getByText('Semana 1'), screen.getByText('Semana 2'), screen.getByText('Semana 3')];
    eyebrows.forEach((eyebrow, i) => {
      expect(eyebrow).toHaveStyle({ color: UNIT_PALETTE[i % UNIT_PALETTE.length].hi });
    });
  });

  it('keeps the current node interactive and the locked node non-interactive', () => {
    renderTree();
    const current = screen.getAllByTestId('tree-node-current')[0];
    expect(current).not.toBeDisabled();
  });

  it('keeps the done/total progress count per unit', () => {
    renderTree();
    const progress = (_content: string, element: Element | null) =>
      element?.textContent === '0/1 lições';
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
