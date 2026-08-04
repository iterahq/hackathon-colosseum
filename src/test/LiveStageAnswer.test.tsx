import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';
import type { StagedAnswer } from '@/types/liveClass';

/**
 * Puxar alguém pro palco numa questão de resposta servia pra mostrar A RESPOSTA
 * — e o palco só dizia "respondeu corretamente", que é o que o professor já via
 * na sidebar (feedback da aula, 2026-08-02). O texto sempre existiu no cliente
 * do aluno (`detail.response`); era descartado na hora de guardar.
 */

vi.mock('@/components/editor/CodeEditor', () => ({
  CodeEditor: ({ value }: { value: string }) => <pre>{value}</pre>,
}));
vi.mock('@/components/branded/activity/code/CodeLivePreview', () => ({
  CodeLivePreview: () => <div />,
}));

const { LiveStage } = await import('@/components/live/LiveStage');

const author = { userId: 'a', name: 'Alba', avatarUrl: null };

const question: Activity = {
  id: 'act-1',
  lessonId: 'lesson-1',
  ordinal: 0,
  kind: 'single_choice',
  spec: { instruction: { pt: 'Qual comando salva?', en: 'Which command saves?' } },
  rubric: null,
};

function renderStage(over: Partial<StagedAnswer>, activity?: Activity) {
  render(
    <I18nProvider>
      <LiveStage
        staged={{
          activityId: 'act-1',
          kind: 'answer',
          content: 'wrong',
          status: 'submitted',
          author,
          ...over,
        }}
        activity={activity}
      />
    </I18nProvider>
  );
}

describe('LiveStage — a resposta do aluno', () => {
  it('mostra o que o aluno respondeu, não só o veredito', () => {
    renderStage({ response: 'git add .' });
    expect(screen.getByTestId('live-stage-response').textContent).toBe('git add .');
    expect(screen.getByTestId('live-stage-summary').textContent).toContain('Resposta do aluno');
  });

  // Sem a pergunta ao lado a turma não acompanha a discussão da resposta.
  it('projeta a PERGUNTA junto da resposta', () => {
    renderStage({ response: 'git add .' }, question);
    expect(screen.getByTestId('live-stage-activity')).toBeTruthy();
    expect(screen.getByTestId('live-stage-response')).toBeTruthy();
  });

  // Cliente de um build anterior não manda `response`: degrada pro veredito.
  it('cai no veredito sozinho quando não veio texto', () => {
    renderStage({ content: 'correct' });
    expect(screen.queryByTestId('live-stage-response')).toBeNull();
    expect(screen.getByTestId('live-stage-summary').textContent).toContain(
      'Respondeu corretamente'
    );
  });
});
