import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ActivityI18nBridge } from '@/components/branded/activity/IteraActivityHost';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { LiveStage } from '@/components/live/LiveStage';
import { CHAT_SANDBOX_SPEC } from '@/stories/contractFixtures';
import { forgetChatLiveBuffer } from '@/services/chatLiveBuffer.service';
import { gatherStageContent } from '@/utils/stageAnswerContent';
import type { Activity } from '@/types/content';
import type { StagedAnswer } from '@/types/liveClass';

/**
 * ── PUXAR PRO PALCO, NUM `chat_sandbox` ─────────────────────────────────────
 * Tainan, TG 2026-08-10: *"sim conserta p otro sandbox"* — em resposta ao
 * relatório de que o sandbox de chat tinha o mesmo buraco que o terminal
 * (PR #342).
 *
 * O teste é o CANO INTEIRO, pelo mesmo motivo do irmão do terminal: o defeito
 * não estava em nenhuma das pontas isoladamente. O palco montava a atividade, o
 * renderer montava limpo, e cada peça, sozinha, "funcionava".
 *
 *   aluno monta o chat → envia uma mensagem
 *     → `gatherStageContent` (o que o cliente dele responde ao puxão)
 *       → `LiveStage` (o que a sala vê)
 *
 * A asserção que importa é sobre a MENSAGEM ESPECÍFICA na tela do palco, nunca
 * "renderizou um chat". Um chat vazio também renderiza um chat — com a saudação
 * autorada dentro, que é justamente por que este bug era mais difícil de ver que
 * o do terminal.
 *
 * ⚠️ O `ActivityI18nBridge` PRECISA ser real: é ele que injeta o `liveBuffer`.
 * Sem a porta, o publish do pacote é um no-op silencioso e todo
 * `gatherStageContent` abaixo leria `empty` — o teste passaria a afirmar o bug
 * em vez do conserto.
 */

const SESSION = 'sess-1';
const ACTIVITY = 'act-chat';

const activity: Activity = {
  id: ACTIVITY,
  lessonId: 'lesson-1',
  ordinal: 0,
  kind: 'chat_sandbox',
  spec: CHAT_SANDBOX_SPEC as Record<string, unknown>,
  rubric: null,
};

const author = { userId: 'aluno-1', name: 'Alba', avatarUrl: null };

/** A tela do ALUNO — o cliente dele, montando a atividade de verdade. */
function openLearnerChat() {
  return render(
    <I18nProvider>
      <ActivityI18nBridge>
        <ActivityRenderer activity={activity} onComplete={vi.fn()} live />
      </ActivityI18nBridge>
    </I18nProvider>,
  );
}

/** Clica o chip do seed — é isso que enche o compositor, sem enviar nada. */
function composeWithoutSending() {
  fireEvent.click(screen.getByTestId('sandbox-seed-chip'));
}

function send() {
  fireEvent.click(screen.getByTestId('sandbox-send'));
}

/** A tela de QUEM ASSISTE — o palco, com o que o puxão trouxe. */
function renderStage(staged: StagedAnswer) {
  return render(
    <I18nProvider>
      <ActivityI18nBridge>
        <LiveStage staged={staged} activity={activity} />
      </ActivityI18nBridge>
    </I18nProvider>,
  );
}

function stagedFromLearner(): StagedAnswer {
  const gathered = gatherStageContent(SESSION, ACTIVITY);
  return { activityId: ACTIVITY, ...gathered, author };
}

/** O texto que o aluno manda neste cenário — o `basePrompt` autorado. */
const SENT_TEXT = 'Me explica o que é contexto pra uma IA.';

beforeEach(() => {
  forgetChatLiveBuffer(ACTIVITY);
  localStorage.clear();
});
afterEach(cleanup);

describe('live stage — mirroring a chat_sandbox', () => {
  it('carries the learner turn AND the sandbox reply to the pull reply', () => {
    openLearnerChat();
    composeWithoutSending();
    send();

    const gathered = gatherStageContent(SESSION, ACTIVITY);
    expect(gathered.kind).toBe('chat');
    expect(gathered.status).toBe('in_progress');

    const mine = gathered.chat!.messages.filter((m) => m.role === 'user').map((m) => m.text);
    // O que ELE mandou.
    expect(mine).toContain(SENT_TEXT);
    // O que o sandbox RESPONDEU — a outra metade do que o palco existe pra
    // mostrar. Vem do `cannedResults` resolvido no cliente dele.
    const theirs = gathered.chat!.messages.filter((m) => m.role === 'assistant');
    expect(theirs.length).toBeGreaterThan(1);
    expect(gathered.chat!.sentCount).toBe(1);
  });

  it('shows that exact message on the stage, under the learner name', () => {
    openLearnerChat();
    composeWithoutSending();
    send();
    const staged = stagedFromLearner();
    cleanup();

    renderStage(staged);
    const mirror = screen.getByTestId('chat-screen-mirror');
    expect(mirror.textContent).toContain(SENT_TEXT);
    expect(screen.getByTestId('live-stage-identity').textContent).toContain('Alba');
    expect(screen.getByTestId('live-stage-status').textContent).toContain('Em andamento');
    // O enunciado do passo viaja JUNTO: sem ele quem assiste lê respostas sem
    // saber o que foi pedido. E é o passo em que o ALUNO está — o envio acima
    // liquidou o passo 1, então quem assiste vê o passo 2.
    const instruction = screen.getByTestId('sandbox-instruction').textContent!;
    expect(instruction).toContain('Passo 2/2');
    expect(instruction).toContain('Essa resposta foi boa?');
  });

  /**
   * ⚠️ A ASSERÇÃO DE PRIVACIDADE — a razão desta PR ser diferente da #342.
   *
   * O terminal espelha vocabulário de ferramenta. O chat espelha prosa do aluno,
   * e o Tainan decidiu projetá-la sabendo disso. A decisão foi de MIRROR: o que
   * ele ENVIOU pra conversa. O compositor — onde mora o pensamento pela metade —
   * fica de fora, e o único jeito de isso continuar verdade depois do próximo
   * refactor é uma asserção.
   *
   * O chip do seed enche o compositor de verdade (o preview aparece na tela do
   * aluno) e não envia nada. Depois dele, o buffer tem que estar intocado.
   */
  it('NEVER carries the unsent composer draft — only what the learner sent', () => {
    openLearnerChat();
    composeWithoutSending();

    // A prova de que o compositor está de fato preenchido na tela DELE: sem
    // isto, o teste passaria por não ter havido rascunho nenhum.
    expect(screen.getByTestId('sandbox-input-preview').textContent).toContain(SENT_TEXT);

    const beforeSend = gatherStageContent(SESSION, ACTIVITY);
    expect(beforeSend.kind).toBe('chat');
    // O palco não vê nada do rascunho, em nenhum turno.
    expect(beforeSend.chat!.messages.some((m) => m.text.includes(SENT_TEXT))).toBe(false);
    // E ele não conta como trabalho: montar e escolher não é ter enviado.
    expect(beforeSend.chat!.sentCount).toBe(0);
    expect(beforeSend.status).toBe('not_started');

    // O mesmo texto passa a viajar no instante em que ele ENVIA — o que prova
    // que a asserção acima é sobre o rascunho, e não sobre o texto ser filtrado.
    send();
    const afterSend = gatherStageContent(SESSION, ACTIVITY);
    expect(afterSend.chat!.messages.some((m) => m.text === SENT_TEXT)).toBe(true);
  });

  /**
   * A REGRESSÃO, escrita como a asserção que faltava.
   *
   * Antes deste PR o palco caía no espelho da atividade, que monta o renderer no
   * cliente de QUEM ASSISTE — `useSandboxScenario` semeia `initialModel`, ou
   * seja a saudação autorada e nada mais. Duas coisas provam que isso acabou: o
   * palco NÃO monta a atividade, e o chat que aparece é o espelho (sem
   * compositor).
   */
  it('never mounts the activity for a chat — a mounted renderer is not a mirror', () => {
    openLearnerChat();
    composeWithoutSending();
    send();
    const staged = stagedFromLearner();
    cleanup();

    renderStage(staged);
    expect(screen.queryByTestId('live-stage-activity')).toBeNull();
    // Sem compositor e sem chips: quem assiste não está jogando o turno do aluno.
    expect(screen.queryByTestId('sandbox-send')).toBeNull();
    expect(screen.queryByTestId('sandbox-seed-chip')).toBeNull();
    expect(screen.queryByTestId('sandbox-controls')).toBeNull();
    expect(screen.getByTestId('chat-screen-mirror').dataset.mirrored).toBe('true');
  });

  it('projects an UNTOUCHED chat as untouched, not as an empty stage', () => {
    openLearnerChat();
    const staged = stagedFromLearner();
    expect(staged.kind).toBe('chat');
    expect(staged.status).toBe('not_started');
    cleanup();

    renderStage(staged);
    expect(screen.getByTestId('live-stage-status').textContent).toContain('Sem edições');
    expect(screen.queryByTestId('live-stage-empty')).toBeNull();
    // A tela dele tem a saudação autorada; ela é projetada, e não é chamada de
    // trabalho.
    expect(screen.getByTestId('chat-screen-mirror').dataset.sentCount).toBe('0');
  });

  /**
   * O aluno saiu da atividade: o buffer é esquecido, e o palco volta a dizer
   * "nada para projetar". Aqui isso vale duplo — o que ficaria no ar é a
   * conversa DELE.
   */
  it('stops projecting once the learner leaves the activity', () => {
    const view = openLearnerChat();
    composeWithoutSending();
    send();
    view.unmount();

    const gathered = gatherStageContent(SESSION, ACTIVITY);
    expect(gathered.kind).toBe('empty');

    renderStage({ activityId: ACTIVITY, ...gathered, author });
    expect(screen.queryByTestId('chat-screen-mirror')).toBeNull();
    expect(screen.getByTestId('live-stage-empty').textContent).toContain('Nada para projetar');
  });

  /**
   * A row LEGADA, ainda com o kind `sandbox_scenario`. Ela renderiza o mesmo
   * shell de chat, então tem que espelhar igual — e, principalmente, o palco não
   * pode remontá-la. O discriminador aqui é o KIND DA ROW; o `spec.sandboxKind`
   * deprecado não é consultado em lugar nenhum.
   */
  it('mirrors a legacy sandbox_scenario row the same way', () => {
    const legacy: Activity = { ...activity, kind: 'sandbox_scenario' };
    render(
      <I18nProvider>
        <ActivityI18nBridge>
          <ActivityRenderer activity={legacy} onComplete={vi.fn()} live />
        </ActivityI18nBridge>
      </I18nProvider>,
    );
    composeWithoutSending();
    send();
    const staged = stagedFromLearner();
    cleanup();

    render(
      <I18nProvider>
        <ActivityI18nBridge>
          <LiveStage staged={staged} activity={legacy} />
        </ActivityI18nBridge>
      </I18nProvider>,
    );
    expect(screen.queryByTestId('live-stage-activity')).toBeNull();
    expect(screen.getByTestId('chat-screen-mirror').textContent).toContain(SENT_TEXT);
  });
});
