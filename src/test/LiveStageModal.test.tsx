import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { StagedAnswer, StagePickerLearner } from '@/types/liveClass';
import { LiveStageModal } from '@/components/live/LiveStageModal';

vi.mock('@/components/editor/CodeEditor', () => ({
  CodeEditor: ({ value }: { value: string }) => <pre data-testid="stage-code">{value}</pre>,
}));
vi.mock('@/components/branded/activity/code/CodeLivePreview', () => ({
  CodeLivePreview: () => <div data-testid="stage-preview" />,
}));

const { LiveStage } = await import('@/components/live/LiveStage');

const learners: StagePickerLearner[] = [
  { userId: 'a', name: 'Alba', avatarUrl: null, state: 'submitted' },
  { userId: 'b', name: 'Bento', avatarUrl: null, state: 'in_progress' },
];

function renderModal(open: boolean, extra: Partial<React.ComponentProps<typeof LiveStageModal>> = {}) {
  const onClose = vi.fn();
  const onPull = vi.fn();
  render(
    <I18nProvider>
      <LiveStageModal
        open={open}
        onClose={onClose}
        learners={learners}
        staged={false}
        onPull={onPull}
        onClear={() => {}}
        {...extra}
      />
    </I18nProvider>
  );
  return { onClose, onPull };
}

describe('LiveStageModal', () => {
  it('renders nothing while closed', () => {
    renderModal(false);
    expect(screen.queryByTestId('live-stage-modal')).toBeNull();
  });

  it('wraps the picker when open', () => {
    renderModal(true);
    expect(screen.getByTestId('live-stage-modal')).toBeInTheDocument();
    expect(screen.getAllByTestId('live-stage-pull')).toHaveLength(2);
  });

  it('closes on the backdrop, the close button, and Escape', () => {
    const { onClose } = renderModal(true);
    fireEvent.click(screen.getByTestId('live-stage-modal-close'));
    fireEvent.click(screen.getByTestId('live-stage-modal'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('keeps a click inside the panel from closing the modal', () => {
    const { onClose, onPull } = renderModal(true);
    fireEvent.click(screen.getAllByTestId('live-stage-pull')[0]);
    expect(onPull).toHaveBeenCalledWith('a');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('LiveStage — instructor view indicator (B9)', () => {
  const staged: StagedAnswer = {
    activityId: 'act-1',
    kind: 'code',
    content: 'const cor = "azul";',
    status: 'in_progress',
    author: { userId: 'a', name: 'Alba', avatarUrl: null },
  };

  it('reads "no palco" for the class-facing stage', () => {
    render(
      <I18nProvider>
        <LiveStage staged={staged} />
      </I18nProvider>
    );
    expect(screen.getByTestId('live-stage-identity').textContent).toContain('No palco');
  });

  it('reads "você está visualizando" when the professor is viewing a learner', () => {
    render(
      <I18nProvider>
        <LiveStage staged={staged} viewingName="Alba" />
      </I18nProvider>
    );
    const identity = screen.getByTestId('live-stage-identity');
    expect(identity.textContent).toContain('Você está visualizando a tela de');
    expect(identity.textContent).toContain('Alba');
  });
});
