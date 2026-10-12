import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n';
import { SkillTree } from './SkillTree';
import { UNIT_PALETTE } from './skillTreeUnitPalette';
import type { ProgramDetail, Activity } from '@/types/content';

const flags = vi.hoisted(() => ({ kindLabelOff: true }));
vi.mock('@/config/focus', async (original) => ({
  ...(await original<typeof import('@/config/focus')>()),
  get FOCUS_DAY_KIND_LABEL_OFF() {
    return flags.kindLabelOff;
  },
}));

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

  it('shows a continuous day number and the lesson title under each node, and no kind label in the focus build', () => {
    renderTree();
    expect(screen.getByText('Dia 1')).toBeInTheDocument();
    expect(screen.getByText('Dia 3')).toBeInTheDocument();
    expect(screen.getAllByText('Lesson 1').length).toBeGreaterThan(0);
    expect(screen.queryByText('Documento')).toBeNull();
    expect(screen.queryByTestId('node-kind')).toBeNull();
  });

  it('a build that keeps the kind label shows the kind of the first activity under each node', () => {
    flags.kindLabelOff = false;
    renderTree();
    expect(screen.getAllByText('Documento').length).toBe(3);
    flags.kindLabelOff = true;
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

  it('leaves the lesson title to the callout on the primary node and keeps it under the others', () => {
    renderTree();
    expect(screen.getAllByText('Lesson 1')).toHaveLength(1);
    expect(within(screen.getByTestId('tree-callout')).getByText('Lesson 1')).toBeInTheDocument();
    expect(screen.getByText('Lesson 2')).toBeInTheDocument();
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

  describe('a locked node', () => {
    const lockedProgram: ProgramDetail = {
      ...program,
      units: [
        {
          id: 'u1',
          programId: 'p1',
          ordinal: 0,
          title: { en: 'Week one' },
          lessons: [1, 2, 3].map((n) => ({
            id: `l${n}`,
            unitId: 'u1',
            ordinal: n,
            title: { en: `Lesson ${n}` },
            activities: [act(`a${n}`, 'todo')],
          })),
        },
      ],
    };

    function renderWith(onOpenLesson = vi.fn()) {
      render(
        <I18nProvider>
          <SkillTree program={lockedProgram} onOpenLesson={onOpenLesson} />
        </I18nProvider>
      );
      return onOpenLesson;
    }

    it('says what it waits for, announces it, and opens nothing', () => {
      const onOpenLesson = renderWith();
      const [first] = screen.getAllByTestId('tree-node-locked');
      expect(first).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(first);
      const hint = screen.getByTestId('tree-lock-hint');
      expect(within(hint).getByText('Conclua o Dia 1 para liberar')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Conclua o Dia 1 para liberar');
      expect(onOpenLesson).not.toHaveBeenCalled();
    });

    describe('scrolling the hint into view', () => {
      const scrollBy = vi.fn();
      const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');

      function hintBottomAt(bottom: number) {
        rect.mockImplementation(function (this: HTMLElement) {
          const isHint = this.dataset.testid === 'tree-lock-hint';
          return { top: 0, left: 0, width: 0, height: 0, right: 0, x: 0, y: 0, bottom: isHint ? bottom : 0, toJSON: () => ({}) };
        });
      }

      beforeEach(() => {
        scrollBy.mockReset();
        window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
        Object.defineProperty(window, 'innerHeight', { value: 640, configurable: true });
      });

      afterEach(() => rect.mockReset());

      it('scrolls just enough when the hint sits under the fold', async () => {
        hintBottomAt(707);
        renderWith();
        fireEvent.click(screen.getAllByTestId('tree-node-locked')[0]);
        await waitFor(() => expect(scrollBy).toHaveBeenCalledTimes(1));
        expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ top: 83 }));
      });

      it('does not move the page for a hint that is already visible', async () => {
        hintBottomAt(400);
        renderWith();
        fireEvent.click(screen.getAllByTestId('tree-node-locked')[0]);
        await screen.findByTestId('tree-lock-hint');
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        expect(scrollBy).not.toHaveBeenCalled();
      });
    });

    it('answers Enter and Space on the focused node', async () => {
      const user = userEvent.setup();
      renderWith();
      const [first] = screen.getAllByTestId('tree-node-locked');
      first.focus();
      await user.keyboard('{Enter}');
      expect(screen.getByTestId('tree-lock-hint')).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByTestId('tree-lock-hint')).toBeNull();
      await user.keyboard(' ');
      expect(screen.getByTestId('tree-lock-hint')).toBeInTheDocument();
    });

    it('moves to another locked node and closes on a tap outside', async () => {
      const user = userEvent.setup();
      renderWith();
      const [first, second] = screen.getAllByTestId('tree-node-locked');
      await user.click(first);
      await user.click(second);
      expect(screen.getAllByTestId('tree-lock-hint')).toHaveLength(1);
      expect(screen.getByRole('status')).toHaveTextContent('Conclua o Dia 1 para liberar');
      await user.click(document.body);
      expect(screen.queryByTestId('tree-lock-hint')).toBeNull();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });
  });
});
