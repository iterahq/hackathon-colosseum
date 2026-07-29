/**
 * V9 — AS FASES DO BYOC AO VIVO, incluindo as TRANSITÓRIAS e as DEGRADAÇÕES.
 *
 * Plano `20260728-itera-activity-testing`, Fase 3. A Fase 2 registrou, por
 * escrito, que a máquina do BYOC ao vivo — `Phase = compose | responding |
 * evaluate | judging | settled`, cruzada com `responderAvailable`,
 * `judgeAvailable` e `error` — não é alcançável por prop:
 * `SandboxScenarioLiveActivity` aceita só `activity` / `onComplete` / `reveal`,
 * e todo o resto vive dentro de `useSandboxScenarioLive`, mudando apenas via
 * `send()` / `rate()`.
 *
 * ── A DECISÃO DESTE ARQUIVO ────────────────────────────────────────────────
 * O caminho fácil seria adicionar uma prop de produção para injetar o cliente
 * da itera-api. Isso repetiria EXATAMENTE o erro que o ADR-4 está deletando
 * nesta mesma fase (as props `initial*`): uma seam que só existe para o teste
 * ver, num componente de produção. Em vez disso a fronteira do mock é o
 * MÓDULO, no limite do teste (`vi.mock('@/api/iteraApi')`) — a produção não
 * ganha nada, e o hook roda inteiro, de verdade.
 *
 * Complementar a `SandboxScenarioLive.test.tsx`, que já cobre os quatro
 * cenários binários de avaliação, o retry, `!responderAvailable` e
 * `!judgeAvailable`. AQUI ficam as três que faltavam:
 *   - `phase: 'responding'`  (transitória — a resposta em voo)
 *   - `phase: 'judging'`     (transitória — o juiz em voo)
 *   - `error`                (a chamada LANÇA; nunca pode travar o aluno)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import type { Activity } from '@/types/content';

const respond = vi.fn();
const judge = vi.fn();
vi.mock('@/api/iteraApi', () => ({
  iteraApiConfigured: () => true,
  respond: (...a: unknown[]) => respond(...a),
  judge: (...a: unknown[]) => judge(...a),
}));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ session: { access_token: 'test-token' } }),
}));

import { SandboxScenarioLiveActivity } from '@/components/branded/activity/sandbox-live/SandboxScenarioLiveActivity';

const BYOC_SPEC = {
  openness: 'byoc',
  title: { pt: 'Contexto muda tudo', en: 'Context changes everything' },
  prompt: { pt: 'Traga seu contexto', en: 'Bring your context' },
};

function makeActivity(): Activity {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    lessonId: 'l',
    ordinal: 0,
    kind: 'sandbox_scenario',
    spec: BYOC_SPEC,
    rubric: null,
  };
}

function renderLive(onComplete = vi.fn()) {
  render(
    <I18nProvider>
      <SandboxScenarioLiveActivity activity={makeActivity()} onComplete={onComplete} />
    </I18nProvider>,
  );
  return onComplete;
}

/** Uma promessa que o teste resolve/rejeita quando quiser — é assim que uma fase transitória vira observável. */
function deferred<T>() {
  let settle!: (v: T) => void;
  let fail!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    settle = res;
    fail = rej;
  });
  return { promise, settle, fail };
}

/**
 * Espera o passo de avaliação aparecer. Ele é retido de propósito até o
 * typewriter terminar de revelar a resposta inteira (`showEval` exige
 * `streamedOnce && !streaming`) — o aluno lê antes de julgar. Por isso o
 * timeout generoso: a espera é do PRODUTO, não do teste.
 */
async function waitForEval() {
  await screen.findByTestId('byoc-eval', undefined, { timeout: 8000 });
}

function compose(text = 'meu contexto de verdade') {
  fireEvent.change(screen.getByTestId('byoc-input'), { target: { value: text } });
  fireEvent.click(screen.getByTestId('byoc-send'));
}

beforeEach(() => {
  respond.mockReset();
  judge.mockReset();
});

describe('BYOC ao vivo — as fases transitórias (V9)', () => {
  it('phase `responding`: enquanto a resposta está em voo, o aluno vê o estado de espera e o composer sai', async () => {
    const d = deferred<Record<string, unknown>>();
    respond.mockReturnValueOnce(d.promise);
    renderLive();

    compose();

    expect(screen.getByTestId('byoc-responding')).toBeInTheDocument();
    expect(screen.queryByTestId('byoc-send')).not.toBeInTheDocument();
    expect(screen.queryByTestId('byoc-eval')).not.toBeInTheDocument();

    d.settle({ response: 'uma resposta', model: 'm', responder_available: true });
    await waitFor(() => expect(screen.queryByTestId('byoc-responding')).not.toBeInTheDocument());
    await waitForEval();
  }, 20000);

  it('phase `judging`: sem `context_good`, avaliar chama o juiz e o aluno vê o estado de espera até o veredito', async () => {
    // `context_good` AUSENTE ⇒ o hook cai no caminho do juiz (deploy antigo da itera-api).
    respond.mockResolvedValueOnce({ response: 'uma resposta', model: 'm', responder_available: true });
    const d = deferred<Record<string, unknown>>();
    judge.mockReturnValueOnce(d.promise);
    renderLive();

    compose();
    await waitForEval();
    fireEvent.click(screen.getByTestId('byoc-rate-good'));

    expect(screen.getByTestId('byoc-judging')).toBeInTheDocument();
    expect(screen.queryByTestId('byoc-outcome')).not.toBeInTheDocument();

    d.settle({
      result_id: 'r',
      activity_id: 'a',
      attempt: 1,
      status: 'passed',
      passed: true,
      score: 90,
      feedback: 'boa leitura do contexto',
      criteria: [],
      model: 'm',
      progress_status: 'completed',
      judge_available: true,
    });
    await waitFor(() => expect(screen.getByTestId('byoc-outcome')).toBeInTheDocument());
    expect(screen.queryByTestId('byoc-judging')).not.toBeInTheDocument();
  }, 20000);
});

describe('BYOC ao vivo — degradação por ERRO (V9)', () => {
  it('respond() LANÇA: o aluno recebe uma resposta de contingência e a nota de degradação — nunca um bloqueio', async () => {
    respond.mockRejectedValueOnce(new Error('itera-api not configured'));
    const onComplete = renderLive();

    compose();

    await waitFor(() => expect(screen.getByTestId('byoc-responder-degraded')).toBeInTheDocument());
    // O fluxo continua: o passo de avaliação existe mesmo com a resposta degradada.
    await waitForEval();
    expect(onComplete).not.toHaveBeenCalled();
  }, 20000);

  it('judge() LANÇA: o resultado vira `unverified`, é registrado, e o aluno segue em frente', async () => {
    respond.mockResolvedValueOnce({ response: 'uma resposta', model: 'm', responder_available: true });
    judge.mockRejectedValueOnce(new Error('judge exploded'));
    const onComplete = renderLive();

    compose();
    await waitForEval();
    fireEvent.click(screen.getByTestId('byoc-rate-good'));

    await waitFor(() => expect(screen.getByTestId('byoc-outcome')).toBeInTheDocument());
    expect(screen.getByTestId('byoc-outcome').getAttribute('data-outcome')).toBe('unverified');
    // Não-verificável NÃO é reprovação: o veredito sobe positivo para o footer.
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(true, expect.anything()));
  }, 20000);

  it('as duas chamadas LANÇAM na sequência: nem assim o aluno fica preso', async () => {
    respond.mockRejectedValueOnce(new Error('responder down'));
    judge.mockRejectedValueOnce(new Error('judge down'));
    const onComplete = renderLive();

    compose();
    await waitForEval();
    fireEvent.click(screen.getByTestId('byoc-rate-bad'));

    await waitFor(() => expect(screen.getByTestId('byoc-outcome')).toBeInTheDocument());
    expect(screen.getByTestId('byoc-outcome').getAttribute('data-outcome')).toBe('unverified');
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(true, expect.anything()));
  }, 20000);
});
