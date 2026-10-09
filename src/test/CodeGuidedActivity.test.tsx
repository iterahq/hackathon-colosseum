import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Activity } from '@/types/content';
import { CODE_DROPDOWN_SPEC, CODE_OPTIONS_SPEC, CODE_TEXT_SPEC } from '@/stories/contractFixtures';
import { CodeActivityHost, previewIframe } from './support/codeActivityHost';

/**
 * The draft store is stubbed at the SERVICE, not at the package: the guided pane
 * writes through `ActivityStoragePort` and `ITERA_ACTIVITY_STORAGE` is what turns
 * those calls into `codeSnapshot.service` calls, so asserting the service is
 * asserting what really reaches disk — including WHICH of the two slots it lands
 * in. See `src/services/codeSnapshot.service.ts` for why guided needs a second
 * slot instead of a wider snapshot.
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

function renderGuided(spec: Record<string, unknown>, status: Activity['status'] = undefined) {
  const onComplete = vi.fn();
  const activity: Activity = {
    id: 't-guided',
    lessonId: 'l',
    ordinal: 0,
    kind: 'code',
    spec,
    rubric: null,
    ...(status && { status }),
  };
  render(
    <CodeActivityHost>
      <CodeSnackActivity activity={activity} onComplete={onComplete} />
    </CodeActivityHost>,
  );
  return onComplete;
}

const savedBlanks = () => JSON.parse(saveGuidedBlanks.mock.calls.at(-1)?.[1] as string) as unknown;
const shell = () => screen.getByTestId('activity-shell');
const blank = (id: string) => screen.getByTestId(`guided-blank-${id}`);
const chip = (word: string) =>
  screen.getAllByTestId('guided-bank-chip').find((c) => c.getAttribute('data-value') === word)!;
const click = (el: Element) => act(() => void fireEvent.click(el));

beforeEach(() => {
  vi.useFakeTimers();
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

describe('code guiado — o despacho', () => {
  it('manda um spec COM blanks pro painel guiado, não pro editor aberto', () => {
    renderGuided(CODE_OPTIONS_SPEC);
    expect(shell()).toHaveAttribute('data-guided-variant', 'options');
    expect(screen.getByTestId('guided-code-template')).toBeInTheDocument();
    // Nenhum Monaco: o editor aberto nem monta nesta variante.
    expect(screen.queryByTestId('mock-editor')).toBeNull();
    expect(screen.queryByTestId('code-submit')).toBeNull();
  });

  it('deixa o spec SEM blanks no editor aberto', () => {
    renderGuided({ prompt: 'p', starter: 'const a = 1' });
    expect(screen.queryByTestId('guided-code-template')).toBeNull();
    expect(screen.getByTestId('mock-editor')).toBeInTheDocument();
  });
});

describe('CodeWithOptions (bank)', () => {
  it('o chip cai na primeira lacuna vazia, sem clique de mira', () => {
    renderGuided(CODE_OPTIONS_SPEC);
    expect(blank('hook')).toHaveAttribute('data-active', 'true');

    click(chip('useState'));
    expect(blank('hook')).toHaveTextContent('useState');
    // A mira anda sozinha: ler o código de cima pra baixo já é o caminho certo.
    expect(blank('evento')).toHaveAttribute('data-active', 'true');
  });

  it('mira onde o aluno clicou, quando ele clica', () => {
    renderGuided(CODE_OPTIONS_SPEC);
    click(blank('evento'));
    click(chip('onClick'));
    expect(blank('evento')).toHaveTextContent('onClick');
    // A de cima ficou vazia e volta a ser a mira — a mira explícita vale uma vez.
    expect(blank('hook')).not.toHaveTextContent('useState');
    expect(blank('hook')).toHaveAttribute('data-active', 'true');
  });

  it('chip gasto fica na lista, apagado — o banco não reflui embaixo do dedo', () => {
    renderGuided(CODE_OPTIONS_SPEC);
    click(chip('useState'));
    expect(chip('useState')).toHaveAttribute('data-spent', 'true');
    expect(chip('useState')).toBeDisabled();
    expect(screen.getAllByTestId('guided-bank-chip')).toHaveLength(4);
  });

  it('clicar numa lacuna preenchida devolve o chip', () => {
    renderGuided(CODE_OPTIONS_SPEC);
    click(chip('useState'));
    click(blank('hook'));
    expect(chip('useState')).toHaveAttribute('data-spent', 'false');
    expect(blank('hook')).not.toHaveTextContent('useState');
  });

  it('tapping a wrong hole after a submit gives the chip back and resumes editing', () => {
    renderGuided(CODE_OPTIONS_SPEC);
    click(chip('onClick'));
    click(chip('useState'));
    click(screen.getByTestId('guided-submit'));
    expect(screen.getByTestId('guided-feedback')).toHaveAttribute('data-all-correct', 'false');
    expect(blank('hook')).toBeEnabled();

    click(blank('hook'));
    expect(chip('onClick')).toHaveAttribute('data-spent', 'false');
    expect(blank('hook')).not.toHaveTextContent('onClick');
    expect(screen.queryByTestId('guided-feedback')).toBeNull();
    expect(screen.getByTestId('guided-submit')).toBeEnabled();
  });

  it('submitting with empty gaps is graded as wrong, never blocked', () => {
    const onComplete = renderGuided(CODE_OPTIONS_SPEC);
    expect(screen.getByTestId('guided-submit')).toBeEnabled();

    click(screen.getByTestId('guided-submit'));
    expect(screen.getByTestId('guided-feedback')).toHaveAttribute('data-all-correct', 'false');
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByTestId('guided-retry')).toBeInTheDocument();
  });

  it('submit stays enabled and grades as correct once every gap is filled', () => {
    const onComplete = renderGuided(CODE_OPTIONS_SPEC);
    expect(screen.getByTestId('guided-submit')).toBeEnabled();

    click(chip('useState'));
    click(chip('onClick'));
    expect(screen.getByTestId('guided-submit')).toBeEnabled();

    click(screen.getByTestId('guided-submit'));
    expect(screen.getByTestId('guided-feedback')).toHaveAttribute('data-all-correct', 'true');
    // O veredito é do aluno até ele seguir — igual ao `code` com checks.
    expect(onComplete).not.toHaveBeenCalled();

    click(screen.getByTestId('guided-continue'));
    expect(onComplete).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ response: expect.stringContaining('useState(0)') }),
    );
  });
});

describe('CodeWithDropdown (select)', () => {
  const choose = (id: string, value: string) =>
    act(() => void fireEvent.change(blank(id), { target: { value } }));

  it('lista SÓ a lacuna errada, com a dica dela', () => {
    const onComplete = renderGuided(CODE_DROPDOWN_SPEC);
    expect(shell()).toHaveAttribute('data-guided-variant', 'dropdown');
    choose('hook', 'useState');
    choose('evento', 'onChange');
    click(screen.getByTestId('guided-submit'));

    expect(screen.getByTestId('guided-feedback')).toHaveAttribute('data-all-correct', 'false');
    const wrong = screen.getByTestId('guided-feedback-wrong');
    expect(wrong.querySelectorAll('li')).toHaveLength(1);
    expect(wrong).toHaveTextContent('CLICAR');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('"tentar de novo" volta a editar SEM apagar o que já estava certo', () => {
    renderGuided(CODE_DROPDOWN_SPEC);
    choose('hook', 'useState');
    choose('evento', 'onChange');
    click(screen.getByTestId('guided-submit'));
    click(screen.getByTestId('guided-retry'));

    expect(screen.queryByTestId('guided-feedback')).toBeNull();
    expect(blank('hook')).toHaveValue('useState');
    expect(blank('evento')).toBeEnabled();
  });

  it('congela as lacunas enquanto o veredito está na tela', () => {
    renderGuided(CODE_DROPDOWN_SPEC);
    choose('hook', 'useState');
    choose('evento', 'onClick');
    expect(blank('hook')).toBeEnabled();

    click(screen.getByTestId('guided-submit'));
    expect(blank('hook')).toBeDisabled();
  });

  it('seguir depois de errar registra o resultado REAL', () => {
    const onComplete = renderGuided(CODE_DROPDOWN_SPEC);
    choose('hook', 'useEffect');
    choose('evento', 'onClick');
    click(screen.getByTestId('guided-submit'));
    click(screen.getByTestId('guided-continue'));

    expect(onComplete).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ response: expect.any(String) }),
    );
    // Liquidado: as ações estão gastas e um segundo clique não reporta de novo.
    expect(screen.getByTestId('guided-feedback')).toHaveAttribute('data-settled', 'true');
    click(screen.getByTestId('guided-continue'));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('CodeWithTextInput (text)', () => {
  const type = (id: string, value: string) =>
    act(() => void fireEvent.change(blank(id), { target: { value } }));

  it('segura o preview até a última lacuna — meio substituído é erro de sintaxe', () => {
    renderGuided(CODE_TEXT_SPEC);
    expect(screen.getByTestId('guided-preview-waiting')).toBeInTheDocument();

    type('setter', 'setCurtidas');
    expect(screen.getByTestId('guided-preview-waiting')).toBeInTheDocument();

    type('inicial', '0');
    expect(screen.queryByTestId('guided-preview-waiting')).toBeNull();

    // O preview real: o iframe só recebe código depois de anunciar que subiu.
    const preview = previewIframe();
    preview.boot();
    const sent = preview.posted.filter((m) => m.type === 'itera:code').at(-1);
    expect(sent?.code).toContain('setCurtidas');
  });

  it('autossalva as DUAS metades do rascunho, com debounce', () => {
    renderGuided(CODE_TEXT_SPEC);
    type('setter', 'setCurtidas');
    expect(saveCodeSnapshot).not.toHaveBeenCalled();
    expect(saveGuidedBlanks).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(600));
    // A fonte substituída na fatia que o palco do professor projeta…
    expect(saveCodeSnapshot).toHaveBeenCalledWith(
      't-guided',
      expect.stringContaining('setCurtidas'),
    );
    // …e as respostas por lacuna na fatia própria do guiado, que é a única de
    // onde os widgets podem ser recompostos.
    expect(saveGuidedBlanks).toHaveBeenCalledWith('t-guided', expect.any(String));
    expect(savedBlanks()).toEqual({ setter: 'setCurtidas' });
  });

  it('salva as lacunas ainda dentro do debounce quando a página vai embora', () => {
    renderGuided(CODE_TEXT_SPEC);
    type('setter', 'setCurtidas');
    act(() => {
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(savedBlanks()).toEqual({ setter: 'setCurtidas' });
    act(() => void vi.advanceTimersByTime(600));
    expect(saveGuidedBlanks).toHaveBeenCalledTimes(1);
  });

  it('não escreve rascunho de quem só abriu a tela', () => {
    readGuidedBlanks.mockReturnValue(JSON.stringify({ setter: 'setCurtidas' }));
    renderGuided(CODE_TEXT_SPEC);
    act(() => void vi.advanceTimersByTime(600));
    expect(saveCodeSnapshot).not.toHaveBeenCalled();
    expect(saveGuidedBlanks).not.toHaveBeenCalled();
  });

  it('restaura as respostas do aluno, descartando lacuna que o autor removeu', () => {
    readGuidedBlanks.mockReturnValue(
      JSON.stringify({ setter: 'setCurtidas', lacunaVelha: 'lixo' }),
    );
    renderGuided(CODE_TEXT_SPEC);
    expect(blank('setter')).toHaveValue('setCurtidas');
    expect(screen.getByTestId('guided-submit')).toBeEnabled();
  });

  it('"recomeçar" esvazia as lacunas e joga as duas metades fora', () => {
    renderGuided(CODE_TEXT_SPEC);
    type('setter', 'setCurtidas');

    click(screen.getByTestId('code-reset'));
    click(screen.getByTestId('code-reset-confirm'));

    expect(blank('setter')).toHaveValue('');
    expect(clearCodeSnapshot).toHaveBeenCalledWith('t-guided');
    expect(clearGuidedBlanks).toHaveBeenCalledWith('t-guided');
    act(() => void vi.advanceTimersByTime(600));
    expect(saveGuidedBlanks).not.toHaveBeenCalled();
  });
});

/* Os três casos abaixo passaram numa review e são regressões, não cenários
 * bonitos: cada um deles deixava o aluno preso ou julgado por algo fora da tela. */
describe('code guiado — o aluno preso', () => {
  const chips = (word: string) =>
    screen.getAllByTestId('guided-bank-chip').filter((c) => c.getAttribute('data-value') === word);

  it('duas lacunas com a MESMA resposta ganham dois chips', () => {
    renderGuided({
      prompt: 'p',
      starter: '{{blank:a}} x = 1;\n{{blank:b}} y = 2;',
      blanks: [
        { id: 'a', kind: 'bank', answer: 'let' },
        { id: 'b', kind: 'bank', answer: 'let' },
      ],
    });
    expect(chips('let')).toHaveLength(2);

    click(chips('let')[0]);
    // Um gasto, um vivo: com dedupe o segundo buraco nunca fechava.
    expect(chips('let').map((c) => c.getAttribute('data-spent'))).toEqual(['true', 'false']);

    click(chips('let')[1]);
    expect(blank('b')).toHaveTextContent('let');
    expect(screen.getByTestId('guided-submit')).toBeEnabled();
  });

  it('com todas as lacunas cheias o banco inteiro fica inerte, não só apagado', () => {
    renderGuided(CODE_OPTIONS_SPEC);
    click(chip('useState'));
    click(chip('onClick'));
    // O distrator continua na tela; clicável ele seria um no-op que o aluno lê
    // como "o app me ignorou".
    expect(chip('useEffect')).toBeDisabled();
  });

  it('não ressuscita valor de select que saiu das opções', () => {
    readGuidedBlanks.mockReturnValue(
      JSON.stringify({ hook: 'useState', evento: 'foiRemovido' }),
    );
    renderGuided(CODE_DROPDOWN_SPEC);
    expect(blank('hook')).toHaveValue('useState');
    // Vazia de verdade: com o valor restaurado no estado o enviar abria e o
    // veredito falava de uma palavra que não estava na tela.
    expect(blank('evento')).toHaveValue('');
    click(screen.getByTestId('guided-submit'));
    expect(screen.getByTestId('guided-feedback')).toHaveAttribute('data-all-correct', 'false');
  });

  it('o veredito diz QUAL lacuna errou, não só que uma errou', () => {
    renderGuided(CODE_DROPDOWN_SPEC);
    act(() => void fireEvent.change(blank('hook'), { target: { value: 'useState' } }));
    act(() => void fireEvent.change(blank('evento'), { target: { value: 'onChange' } }));
    click(screen.getByTestId('guided-submit'));

    const item = screen.getByTestId('guided-feedback-wrong').querySelector('li');
    expect(item).toHaveAttribute('data-blank-id', 'evento');
    expect(item).toHaveTextContent('Lacuna 2');
  });
});

describe('code guiado — activity concluída', () => {
  it('não deixa responder de novo', () => {
    renderGuided(CODE_OPTIONS_SPEC, 'done');
    expect(blank('hook')).toBeDisabled();
    expect(screen.getByTestId('guided-submit')).toBeDisabled();
    expect(screen.getByTestId('code-reset')).toBeDisabled();
  });
});
