import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider, resources } from '@/i18n';
import type { StagedAnswer } from '@/types/liveClass';

vi.mock('@/components/editor/CodeEditor', () => ({
  CodeEditor: ({ value }: { value: string }) => <pre data-testid="stage-code">{value}</pre>,
}));
vi.mock('@/components/branded/activity/code/CodeLivePreview', () => ({
  CodeLivePreview: () => <div data-testid="stage-preview" />,
}));

const { LiveStage } = await import('@/components/live/LiveStage');

const staged: StagedAnswer = {
  activityId: 'act-1',
  kind: 'code',
  content: 'const cor = "azul";',
  status: 'in_progress',
  author: { userId: 'a', name: 'Alba', avatarUrl: null },
};

describe('LiveStage — teto na superfície do aluno', () => {
  it('caps the body only when asked', () => {
    const { unmount } = render(
      <I18nProvider>
        <LiveStage staged={staged} capped />
      </I18nProvider>
    );
    const capped = screen.getByTestId('live-stage-body');
    expect(capped.dataset.capped).toBe('true');
    expect(capped.className).toContain('max-h-[52dvh]');
    unmount();

    render(
      <I18nProvider>
        <LiveStage staged={staged} />
      </I18nProvider>
    );
    const uncapped = screen.getByTestId('live-stage-body');
    expect(uncapped.dataset.capped).toBe('false');
    expect(uncapped.className).not.toContain('max-h-');
  });

  it('has no collapse affordance on the instructor surface', () => {
    render(
      <I18nProvider>
        <LiveStage staged={staged} />
      </I18nProvider>
    );
    expect(screen.queryByTestId('live-stage-collapse')).toBeNull();
  });

  it('collapses to the identity bar and back', () => {
    render(
      <I18nProvider>
        <LiveStage staged={staged} capped />
      </I18nProvider>
    );
    const toggle = screen.getByTestId('live-stage-collapse');
    expect(toggle.textContent).toContain(resources.pt['live.stage.collapse']);

    fireEvent.click(toggle);
    expect(screen.queryByTestId('live-stage-body')).toBeNull();
    // Quem está no palco continua nomeado: recolher esconde o trabalho, não a
    // informação de que a turma está olhando pra tela de alguém.
    expect(screen.getByTestId('live-stage-identity').textContent).toContain('Alba');
    expect(toggle.textContent).toContain(resources.pt['live.stage.expand']);

    fireEvent.click(toggle);
    expect(screen.getByTestId('live-stage-body')).toBeTruthy();
  });

  it('has the toggle labels in both locales', () => {
    for (const locale of ['pt', 'en'] as const) {
      expect(resources[locale]['live.stage.collapse']).toBeTruthy();
      expect(resources[locale]['live.stage.expand']).toBeTruthy();
    }
  });
});
