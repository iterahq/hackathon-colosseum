import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { Activity } from '@/types/content';
import { CODE_DROPDOWN_SPEC } from '@/stories/contractFixtures';
import { CODE_ATTEMPT_BUDGET } from '@iterahq/activities/code';
import { rememberStorageScope } from '@/utils/storageScope';
import { clearLearnerLessonState } from '@/utils/liveLessonReset';
import { grantCodeAttempt } from '@/services/codeAttempts.service';
import { CodeActivityHost, previewIframe, typeCode } from './support/codeActivityHost';
import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';

/**
 * O teto de 3 envios errados, ponta a ponta e contra o localStorage DE VERDADE.
 *
 * Nada de `vi.mock` no depósito aqui, ao contrário de `CodeSnackActivity.test.tsx`:
 * o que estas regressões precisam provar é que a vida gasta SOBREVIVE a um F5, e
 * um mock de serviço prova só que a função foi chamada. O caminho exercitado é o
 * inteiro — `useCodeAttempts` → `ActivityStoragePort` → `ITERA_ACTIVITY_STORAGE`
 * → `codeAttempts.service` → chave escopada por aluno em disco.
 */
const ACTIVITY_ID = 't-lives';
const LEARNER = 'aluno-vidas';

function open(spec: Record<string, unknown>, onComplete = vi.fn()) {
  const activity: Activity = {
    id: ACTIVITY_ID,
    lessonId: 'l',
    ordinal: 0,
    kind: 'code',
    spec,
    rubric: null,
  };
  render(
    <CodeActivityHost>
      <CodeSnackActivity activity={activity} onComplete={onComplete} />
    </CodeActivityHost>,
  );
  return onComplete;
}

const click = (el: Element) => act(() => void fireEvent.click(el));
const attemptsLine = () => screen.getByTestId('code-attempts');
const remaining = () => attemptsLine().getAttribute('data-remaining');
const attemptsInStorage = () =>
  localStorage.getItem(`itera.code.attempts:${LEARNER}:${ACTIVITY_ID}`);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  // Sem escopo de aluno o `scopedKey` devolve `null` e TODA escrita vira no-op —
  // o teste passaria a medir o fallback, não a persistência.
  rememberStorageScope(LEARNER);
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  localStorage.clear();
});

describe('code guiado — as três vidas', () => {
  const blank = (id: string) => screen.getByTestId(`guided-blank-${id}`) as HTMLSelectElement;
  const choose = (id: string, value: string) =>
    act(() => void fireEvent.change(blank(id), { target: { value } }));
  const submitWrong = () => {
    choose('hook', 'useEffect');
    choose('evento', 'onChange');
    click(screen.getByTestId('guided-submit'));
  };
  const submitRight = () => {
    choose('hook', 'useState');
    choose('evento', 'onClick');
    click(screen.getByTestId('guided-submit'));
  };

  it('o primeiro erro custa uma vida e diz quantas sobram', () => {
    open(CODE_DROPDOWN_SPEC);
    submitWrong();

    expect(screen.getByTestId('guided-feedback')).toHaveAttribute('data-all-correct', 'false');
    expect(remaining()).toBe('2');
    expect(attemptsLine()).toHaveAttribute('data-budget', String(CODE_ATTEMPT_BUDGET));
    // Nada terminal ainda: o caminho de volta ao editor continua na tela.
    expect(screen.getByTestId('guided-retry')).toBeInTheDocument();
    expect(screen.queryByTestId('guided-code-answer-shown')).toBeNull();
  });

  it('acertar na segunda encerra normal, sem cobrar a vida do acerto', () => {
    const onComplete = open(CODE_DROPDOWN_SPEC);
    submitWrong();
    click(screen.getByTestId('guided-retry'));
    submitRight();

    expect(screen.getByTestId('guided-feedback')).toHaveAttribute('data-all-correct', 'true');
    click(screen.getByTestId('guided-continue'));
    expect(onComplete).toHaveBeenCalledWith(true, expect.objectContaining({ response: expect.any(String) }));
    // Uma vida gasta, não duas: o envio certo não debita.
    expect(attemptsInStorage()).toContain('"spent":"1"');
  });

  it('a TERCEIRA errada é terminal — sem enviar de novo, sem tentar de novo', () => {
    open(CODE_DROPDOWN_SPEC);
    submitWrong();
    click(screen.getByTestId('guided-retry'));
    submitWrong();
    click(screen.getByTestId('guided-retry'));
    submitWrong();

    expect(screen.getByTestId('activity-shell')).toHaveAttribute('data-out-of-lives', 'true');
    expect(remaining()).toBe('0');
    expect(screen.queryByTestId('guided-submit')).toBeNull();
    expect(screen.queryByTestId('guided-retry')).toBeNull();
  });

  it('sem vidas o guiado MOSTRA a resposta certa', () => {
    // A decisão de produto: no guiado existe gabarito autorado (`blanks[].answer`),
    // e deixar o aluno preso numa tela travada no meio da aula é pior do que
    // entregar a resposta com o resultado registrado como errado.
    open(CODE_DROPDOWN_SPEC);
    submitWrong();
    click(screen.getByTestId('guided-retry'));
    submitWrong();
    click(screen.getByTestId('guided-retry'));
    submitWrong();

    expect(screen.getByTestId('guided-code-answer-shown')).toBeInTheDocument();
    expect(blank('hook')).toHaveValue('useState');
    expect(blank('evento')).toHaveValue('onClick');
  });

  it('seguir sem vidas registra o resultado REAL, não o gabarito na tela', () => {
    const onComplete = open(CODE_DROPDOWN_SPEC);
    submitWrong();
    click(screen.getByTestId('guided-retry'));
    submitWrong();
    click(screen.getByTestId('guided-retry'));
    submitWrong();
    click(screen.getByTestId('guided-continue'));

    expect(onComplete).toHaveBeenCalledWith(false, expect.objectContaining({ response: expect.any(String) }));
  });

  it('o placar sobrevive ao F5 — recarregar não devolve vida', () => {
    open(CODE_DROPDOWN_SPEC);
    submitWrong();
    click(screen.getByTestId('guided-retry'));
    submitWrong();
    expect(remaining()).toBe('1');

    cleanup();
    open(CODE_DROPDOWN_SPEC);
    submitWrong();

    // A terceira depois da remontagem, e não a primeira de um placar zerado.
    expect(remaining()).toBe('0');
    expect(screen.getByTestId('activity-shell')).toHaveAttribute('data-out-of-lives', 'true');
  });

  it('depósito ilegível devolve as três vidas, não zero', () => {
    // Falha ABERTO de propósito: um `NaN` virando "sem vidas" trancaria numa aula
    // ao vivo um exercício que a pessoa nem abriu, e ninguém destrava de dentro.
    localStorage.setItem(`itera.code.attempts:${LEARNER}:${ACTIVITY_ID}`, '{lixo');
    open(CODE_DROPDOWN_SPEC);
    submitWrong();

    expect(remaining()).toBe('2');
  });

  it('o reset da lição ao vivo devolve as vidas', () => {
    open(CODE_DROPDOWN_SPEC);
    submitWrong();
    click(screen.getByTestId('guided-retry'));
    submitWrong();
    cleanup();

    clearLearnerLessonState('sess-1', [ACTIVITY_ID]);
    expect(attemptsInStorage()).toBeNull();

    open(CODE_DROPDOWN_SPEC);
    submitWrong();
    // Sem isto o aluno reabriria o exercício "resetado" já sem vidas, ou seja,
    // impossível de refazer — o oposto do que o reset existe pra resolver.
    expect(remaining()).toBe('2');
  });

  it('a vida do professor destrava a tela SEM recarregar', () => {
    // O aluno não desmonta nada quando a vida chega: sem o aviso do serviço, o
    // `useCodeAttempts` continuaria no saldo que semeou e a tela ficaria travada
    // até um F5 que ninguém tem motivo pra dar.
    open(CODE_DROPDOWN_SPEC);
    submitWrong();
    click(screen.getByTestId('guided-retry'));
    submitWrong();
    click(screen.getByTestId('guided-retry'));
    submitWrong();
    expect(screen.getByTestId('activity-shell')).toHaveAttribute('data-out-of-lives', 'true');

    act(() => grantCodeAttempt(ACTIVITY_ID));

    expect(remaining()).toBe('1');
    expect(screen.getByTestId('activity-shell')).toHaveAttribute('data-out-of-lives', 'false');
    expect(screen.getByTestId('guided-retry')).toBeInTheDocument();
  });
});

describe('code com checks — as três vidas', () => {
  const CHECKS = [
    { id: 'verde', label: 'o botão está verde', hint: 'Use bg-emerald-500.', selector: 'button', assert: { type: 'class', contains: 'bg-emerald-500' } },
  ];
  const SPEC = { prompt: 'Deixe o botão verde', starter: 'const a = 1;', checks: CHECKS };

  let sandbox: ReturnType<typeof previewIframe>;

  function openChecks(onComplete = vi.fn()) {
    const cb = open(SPEC, onComplete);
    sandbox = previewIframe();
    sandbox.boot();
    return cb;
  }

  /** Um envio errado completo: clicar, deixar o sandbox reprovar. */
  function failOnce(source: string) {
    typeCode(source);
    click(screen.getByTestId('code-submit'));
    sandbox.answer([{ id: 'verde', passed: false }]);
  }

  it('o primeiro erro custa uma vida', () => {
    openChecks();
    failOnce('const a = 1;');
    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'false');
    expect(remaining()).toBe('2');
  });

  it('a terceira reprovação tranca o editor aberto e abre a saída', () => {
    const onComplete = openChecks();
    failOnce('const a = 1;');
    click(screen.getByTestId('code-checks-retry'));
    failOnce('const a = 2;');
    click(screen.getByTestId('code-checks-retry'));
    failOnce('const a = 3;');

    expect(screen.getByTestId('activity-shell')).toHaveAttribute('data-out-of-lives', 'true');
    expect(remaining()).toBe('0');
    expect(screen.queryByTestId('code-checks-retry')).toBeNull();
    // Sem gabarito autorado no editor aberto: o que sobra é a dica do check que
    // falhou e o caminho para a próxima atividade.
    expect(screen.getByTestId('code-checks-out-of-lives')).toBeInTheDocument();
    expect(screen.getByTestId('code-check-hint')).toBeInTheDocument();

    click(screen.getByTestId('code-checks-continue'));
    expect(onComplete).toHaveBeenCalledWith(false, expect.objectContaining({ response: expect.any(String) }));
  });

  it('preview que nunca respondeu NÃO cobra vida', () => {
    // O timeout reprova tudo por definição. Debitar aí tiraria do aluno uma
    // tentativa que ele nunca teve — a culpa é do sandbox, não da resposta.
    openChecks();
    typeCode('const a = 1;');
    click(screen.getByTestId('code-submit'));
    act(() => void vi.advanceTimersByTime(8100));

    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'false');
    expect(remaining()).toBe(String(CODE_ATTEMPT_BUDGET));
    expect(attemptsInStorage()).toBeNull();
  });

  it('passar em tudo encerra sem debitar nada', () => {
    const onComplete = openChecks();
    typeCode('const a = 1;');
    click(screen.getByTestId('code-submit'));
    sandbox.answer([{ id: 'verde', passed: true }]);

    expect(screen.getByTestId('code-checks-feedback')).toHaveAttribute('data-all-passed', 'true');
    expect(screen.queryByTestId('code-attempts')).toBeNull();
    expect(attemptsInStorage()).toBeNull();
    expect(onComplete).toHaveBeenCalledWith(true, expect.objectContaining({ response: expect.any(String) }));
  });
});
