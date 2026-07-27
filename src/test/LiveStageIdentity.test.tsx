import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { StagedAnswer } from '@/types/liveClass';

vi.mock('@/components/editor/CodeEditor', () => ({
  CodeEditor: ({ value }: { value: string }) => <pre data-testid="stage-code">{value}</pre>,
}));
vi.mock('@/components/branded/activity/code/CodeLivePreview', () => ({
  CodeLivePreview: () => <div data-testid="stage-preview" />,
}));

const { LiveStage } = await import('@/components/live/LiveStage');

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
