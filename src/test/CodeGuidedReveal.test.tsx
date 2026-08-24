import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Activity } from '@/types/content';
import { CODE_DROPDOWN_SPEC, CODE_OPTIONS_SPEC, CODE_TEXT_SPEC } from '@/stories/contractFixtures';
import { CodeActivityHost } from './support/codeActivityHost';

/**
 * "Revelar resposta" no `code` guiado: o professor para o relógio e o gabarito
 * aparece na tela do aluno.
 *
 * O que estes testes protegem NÃO é o visual — é a fronteira entre ENSINAR e
 * MEDIR. Revelar é estado de apresentação: não escreve rascunho, não chama
 * `onComplete`, não vira acerto no pódio. Se um destes ficar vermelho, o dado de
 * aprendizagem passou a depender de quem estava com a tela aberta na hora em que
 * o professor clicou.
 */
const saveCodeSnapshot = vi.fn();
const clearCodeSnapshot = vi.fn();
const readCodeSnapshot = vi.fn((_id: string) => null as { code: string } | null);
const saveGuidedBlanks = vi.fn();
const clearGuidedBlanks = vi.fn();
const readGuidedBlanks = vi.fn((_id: string) => null as string | null);
vi.mock('@/services/codeSnapshot.service', () => ({
  saveCodeSnapshot: (...args: unknown[]) => saveCodeSnapshot(...args),
  clearCodeSnapshot: (...args: unknown[]) => clearCodeSnapshot(...args),
  readCodeSnapshot: (id: string) => readCodeSnapshot(id),
  saveGuidedBlanks: (...args: unknown[]) => saveGuidedBlanks(...args),
  clearGuidedBlanks: (...args: unknown[]) => clearGuidedBlanks(...args),
  readGuidedBlanks: (id: string) => readGuidedBlanks(id),
}));

import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';

const onComplete = vi.fn();

function activityOf(spec: Record<string, unknown>): Activity {
  return {
    id: 't-guided',
    lessonId: 'l',
    ordinal: 0,
    kind: 'code',
    spec,
    rubric: null,
  };
}

/** Renderiza com `reveal` ligável, para provar a IDA e a VOLTA no mesmo mount. */
function renderReveal(spec: Record<string, unknown>, reveal = true) {
  const view = render(
    <CodeActivityHost>
      <CodeSnackActivity activity={activityOf(spec)} onComplete={onComplete} reveal={reveal} />
    </CodeActivityHost>,
  );
  return (next: boolean) =>
    view.rerender(
      <CodeActivityHost>
        <CodeSnackActivity activity={activityOf(spec)} onComplete={onComplete} reveal={next} />
      </CodeActivityHost>,
    );
}

const shell = () => screen.getByTestId('activity-shell');
const blank = (id: string) => screen.getByTestId(`guided-blank-${id}`);
const chip = (word: string) =>
  screen.getAllByTestId('guided-bank-chip').find((c) => c.getAttribute('data-value') === word)!;
const click = (el: Element) => act(() => void fireEvent.click(el));
const type = (id: string, value: string) =>
  act(() => void fireEvent.change(blank(id), { target: { value } }));

beforeEach(() => {
  vi.useFakeTimers();
  onComplete.mockClear();
  saveCodeSnapshot.mockClear();
  clearCodeSnapshot.mockClear();
  readCodeSnapshot.mockClear();
  readCodeSnapshot.mockReturnValue(null);
  saveGuidedBlanks.mockClear();
  clearGuidedBlanks.mockClear();
  readGuidedBlanks.mockClear();
  readGuidedBlanks.mockReturnValue(null);
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('revelar preenche as lacunas com o gabarito', () => {
  it('bank: cada lacuna mostra a resposta do autor', () => {
    renderReveal(CODE_OPTIONS_SPEC);
    expect(shell()).toHaveAttribute('data-revealed', 'true');
    expect(blank('hook')).toHaveTextContent('useState');
    expect(blank('evento')).toHaveTextContent('onClick');
  });

  it('select: o gabarito é uma das opções, então o valor aparece de verdade', () => {
    renderReveal(CODE_DROPDOWN_SPEC);
    expect(blank('hook')).toHaveValue('useState');
    expect(blank('evento')).toHaveValue('onClick');
  });

  it('text: a lacuna sem candidato nenhum também recebe a resposta', () => {
    renderReveal(CODE_TEXT_SPEC);
    expect(blank('setter')).toHaveValue('setCurtidas');
    expect(blank('inicial')).toHaveValue('0');
  });

  it('não se lê como "você acertou": tom próprio, e dito por extenso', () => {
    // Só a cor seria um veredito que nem todo mundo consegue ler — e o verde de
    // acerto seria uma frase falsa sobre a única pessoa olhando a tela.
    renderReveal(CODE_OPTIONS_SPEC);
    expect(blank('hook')).toHaveAttribute('data-revealed', 'true');
    expect(blank('hook').getAttribute('aria-label')).toContain('resposta do professor');
    expect(screen.getByTestId('guided-code-revealed')).toBeInTheDocument();
    expect(screen.queryByTestId('guided-code-hint')).toBeNull();
  });

  it('trava a tela: nada de editar, enviar ou recomeçar por cima do gabarito', () => {
    renderReveal(CODE_DROPDOWN_SPEC);
    expect(blank('hook')).toBeDisabled();
    expect(screen.queryByTestId('guided-submit')).toBeNull();
    expect(screen.getByTestId('code-reset')).toBeDisabled();
  });

  it('o editor ABERTO não revela nada — não há solução escrita para mostrar', () => {
    renderReveal({ prompt: 'p', starter: 'const a = 1' });
    expect(screen.queryByTestId('guided-code-revealed')).toBeNull();
    expect(screen.getByTestId('mock-editor')).toBeInTheDocument();
  });
});

describe('revelar NÃO contamina dado de aprendizagem', () => {
  it('não escreve nenhuma das duas metades do rascunho', () => {
    renderReveal(CODE_TEXT_SPEC);
    act(() => void vi.advanceTimersByTime(600));
    expect(saveGuidedBlanks).not.toHaveBeenCalled();
    expect(saveCodeSnapshot).not.toHaveBeenCalled();
  });

  it('nem depois de o aluno ter trabalhado antes de o professor clicar', () => {
    const setReveal = renderReveal(CODE_TEXT_SPEC, false);
    type('setter', 'setCurtidas');
    act(() => void vi.advanceTimersByTime(600));
    saveGuidedBlanks.mockClear();
    saveCodeSnapshot.mockClear();

    setReveal(true);
    act(() => void vi.advanceTimersByTime(600));
    // O gabarito NUNCA chega ao disco: o que o autossave lê é o valor do aluno,
    // e ele não mudou, então não há segunda escrita.
    expect(saveGuidedBlanks).not.toHaveBeenCalled();
    expect(saveCodeSnapshot).not.toHaveBeenCalled();
  });

  it('não reporta resultado nenhum, nem com todas as lacunas "cheias" na tela', () => {
    renderReveal(CODE_OPTIONS_SPEC);
    act(() => void vi.advanceTimersByTime(600));
    // O veredito do aluno sai da tela: verde de acerto em cima da resposta do
    // professor é a leitura que esta tela não pode permitir.
    expect(screen.queryByTestId('guided-feedback')).toBeNull();
    expect(screen.queryByTestId('guided-continue')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('não apaga o rascunho: "recomeçar" está inerte com o gabarito na tela', () => {
    renderReveal(CODE_TEXT_SPEC);
    click(screen.getByTestId('code-reset'));
    expect(screen.queryByTestId('code-reset-confirm')).toBeNull();
    expect(clearGuidedBlanks).not.toHaveBeenCalled();
    expect(clearCodeSnapshot).not.toHaveBeenCalled();
  });
});

describe('sair do revelar devolve o que o aluno tinha', () => {
  it('as respostas do aluno voltam — nada foi sobrescrito, então nada é restaurado', () => {
    const setReveal = renderReveal(CODE_TEXT_SPEC, false);
    type('setter', 'minhaResposta');
    expect(blank('setter')).toHaveValue('minhaResposta');

    setReveal(true);
    expect(blank('setter')).toHaveValue('setCurtidas');

    // Religar o relógio é reversível (`revealCurrent` cai sozinho): a tela tem
    // que voltar exatamente ao que estava, inclusive a resposta errada.
    setReveal(false);
    expect(blank('setter')).toHaveValue('minhaResposta');
    expect(shell()).toHaveAttribute('data-revealed', 'false');
    expect(screen.getByTestId('guided-submit')).toBeInTheDocument();
  });

  it('a lacuna vazia continua vazia, e o banco devolve o chip do gabarito', () => {
    const setReveal = renderReveal(CODE_OPTIONS_SPEC, false);
    click(chip('useState'));

    setReveal(true);
    expect(blank('evento')).toHaveTextContent('onClick');
    expect(chip('onClick')).toHaveAttribute('data-spent', 'true');

    setReveal(false);
    expect(blank('hook')).toHaveTextContent('useState');
    expect(blank('evento')).not.toHaveTextContent('onClick');
    expect(chip('onClick')).toHaveAttribute('data-spent', 'false');
  });

  it('e o aluno volta a poder enviar a resposta DELE', () => {
    const setReveal = renderReveal(CODE_OPTIONS_SPEC, false);
    click(chip('useEffect'));
    click(chip('onClick'));

    setReveal(true);
    setReveal(false);
    click(screen.getByTestId('guided-submit'));
    click(screen.getByTestId('guided-continue'));
    // Errado é errado: ter visto o gabarito no meio não muda o veredito.
    expect(onComplete).toHaveBeenCalledWith(false, expect.objectContaining({ response: expect.any(String) }));
  });
});
