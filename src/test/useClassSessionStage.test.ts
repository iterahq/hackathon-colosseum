import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * "Pull to stage" (ADR-3/4) unit coverage over the useClassSession peer-to-peer
 * broadcast layer. A tiny controllable fake RealtimeChannel captures the `.on()`
 * handlers + `.send()` payloads so we can drive stage-request/answer/show/clear
 * and assert the gate: only a matching (nonce+target) stage-answer produces a
 * stage-show, stagedAnswer is only ever set from stage-show, and clearStage resets.
 *
 * ADR-4 revised (2026-07-23): the professor also pulls WORK IN PROGRESS, so the
 * reply now always happens — carrying an explicit `status` (submitted /
 * in_progress / not_started). The security gate is UNCHANGED and re-asserted here.
 */

const SESSION = 'session-1';
const ACTIVITY = 'act-1';
const INSTRUCTOR = 'instructor-1';
const STUDENT = 'student-1';

type Handler = (msg: { payload: unknown }) => void;

let handlers: Record<string, Handler>;
let sent: { event: string; payload: Record<string, unknown> }[];

function makeChannel() {
  const channel = {
    on(type: string, filter: unknown, cb?: Handler) {
      // Broadcast handlers: on('broadcast', { event }, cb). Presence/pg: cb is 2nd arg.
      if (type === 'broadcast' && filter && typeof filter === 'object') {
        const event = (filter as { event?: string }).event;
        if (event && cb) handlers[event] = cb;
      }
      return channel;
    },
    subscribe(cb?: (s: string) => void) {
      cb?.('SUBSCRIBED');
      return channel;
    },
    send(msg: { event: string; payload: Record<string, unknown> }) {
      sent.push({ event: msg.event, payload: msg.payload });
      return Promise.resolve('ok');
    },
    track() {
      return Promise.resolve('ok');
    },
    presenceState() {
      return {};
    },
  };
  return channel;
}

vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  getSupabase: () => ({
    channel: () => makeChannel(),
    removeChannel: () => Promise.resolve(),
    realtime: { setAuth: () => Promise.resolve() },
  }),
}));

vi.mock('@/services/liveClass.service', () => ({
  getClassSession: () =>
    Promise.resolve({
      id: SESSION,
      currentActivityId: ACTIVITY,
      status: 'live',
    }),
  mapSession: (row: unknown) => row,
}));

import { useClassSession } from '@/hooks/useClassSession';
import {
  forgetCodeLiveBuffer,
  publishCodeLiveBuffer,
} from '@/services/codeLiveBuffer.service';
import {
  TERMINAL_LIVE_EVENT,
  forgetTerminalLiveBuffer,
  publishTerminalLiveBuffer,
} from '@/services/terminalLiveBuffer.service';
import {
  CHAT_LIVE_EVENT,
  forgetChatLiveBuffer,
  publishChatLiveBuffer,
} from '@/services/chatLiveBuffer.service';
import type { StageChatScreen, StageTerminalScreen } from '@/types/liveClass';
import { rememberStorageScope } from '@/utils/storageScope';

function emit(event: string, payload: unknown) {
  act(() => handlers[event]?.({ payload }));
}

beforeEach(() => {
  handlers = {};
  sent = [];
  localStorage.clear();
  // O buffer vivo é um Map de módulo, não localStorage: sobrevive entre testes
  // do mesmo arquivo se ninguém o esquecer.
  forgetCodeLiveBuffer(ACTIVITY);
  forgetTerminalLiveBuffer(ACTIVITY);
  forgetChatLiveBuffer(ACTIVITY);
  rememberStorageScope(STUDENT);
});

/** Uma tela de terminal com N comandos rodados, do jeito que o pacote publica. */
function terminalScreen(commands: string[]): StageTerminalScreen {
  return {
    lines: commands.map((text) => ({ kind: 'cmd' as const, text })),
    ps1: 'aluno@itera:~$',
    windowTitle: 'bash — sandbox',
    successLines: [],
    stepIdx: commands.length,
    stepCount: 2,
    stepPrompt: 'Confira a branch.',
    won: false,
    commandCount: commands.length,
  };
}

/**
 * Uma conversa de chat com N turnos ENVIADOS pelo aluno, do jeito que o pacote
 * publica. O seed autorado abre a lista — é ele que faz `messages.length` ser um
 * mau `hasWork`, e `sentCount` ser o bom.
 */
function chatScreen(sent_: string[]): StageChatScreen {
  return {
    messages: [
      { role: 'assistant' as const, text: 'Manda seu pedido que eu respondo.' },
      ...sent_.flatMap((text) => [
        { role: 'user' as const, text },
        { role: 'assistant' as const, text: `resposta a: ${text}` },
      ]),
    ],
    stepIdx: sent_.length,
    stepCount: 2,
    stepPrompt: 'Avalia a resposta.',
    won: false,
    sentCount: sent_.length,
  };
}

async function mountAs(identity: { userId: string; isInstructor: boolean }) {
  const hook = renderHook(() =>
    useClassSession(SESSION, {
      userId: identity.userId,
      name: identity.userId,
      avatarUrl: null,
      isInstructor: identity.isInstructor,
    })
  );
  await waitFor(() => expect(hook.result.current.currentActivityId).toBe(ACTIVITY));
  sent.length = 0; // drop connect-time sends (track etc.)
  return hook;
}

describe('useClassSession — pull to stage', () => {
  it('requestStage broadcasts stage-request with an armed nonce + target', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const req = sent.find((s) => s.event === 'stage-request');
    expect(req).toBeTruthy();
    expect(req!.payload).toMatchObject({ activityId: ACTIVITY, targetUserId: STUDENT });
    expect(typeof req!.payload.nonce).toBe('string');
  });

  it('a matching stage-answer triggers the instructor to emit stage-show', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    const show = sent.find((s) => s.event === 'stage-show');
    expect(show).toBeTruthy();
    expect(show!.payload).toMatchObject({ activityId: ACTIVITY, kind: 'answer', content: 'correct' });
  });

  it('ignores a stage-answer with a mismatched nonce', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce: 'stale-nonce',
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    expect(sent.find((s) => s.event === 'stage-show')).toBeUndefined();
  });

  it('ignores a stage-answer from a different user than the target', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: 'someone-else',
      nonce,
      kind: 'answer',
      content: 'correct',
      author: { userId: 'someone-else', name: 'Mal', avatarUrl: null },
    });

    expect(sent.find((s) => s.event === 'stage-show')).toBeUndefined();
  });

  it('sets stagedAnswer ONLY from stage-show, never directly from stage-answer', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });

    // A raw stage-answer must NOT stage anything on a client.
    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce: 'n',
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    expect(result.current.stagedAnswer).toBeNull();

    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    expect(result.current.stagedAnswer).toMatchObject({
      activityId: ACTIVITY,
      author: { userId: STUDENT, name: 'Alba' },
    });
  });

  it('ignores a stage-show for a non-current activity', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });
    emit('stage-show', {
      activityId: 'other-activity',
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    expect(result.current.stagedAnswer).toBeNull();
  });

  it('clearStage resets stagedAnswer and broadcasts stage-clear', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    expect(result.current.stagedAnswer).not.toBeNull();

    act(() => result.current.clearStage());
    expect(result.current.stagedAnswer).toBeNull();
    expect(sent.find((s) => s.event === 'stage-clear')).toBeTruthy();
  });

  it('the targeted student replies to stage-request with its own stored answer', async () => {
    localStorage.setItem(
      `itera.live.answers:${STUDENT}:${SESSION}`,
      JSON.stringify({ [ACTIVITY]: { correct: true, elapsedMs: 1200 } })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    const answer = sent.find((s) => s.event === 'stage-answer');
    expect(answer).toBeTruthy();
    expect(answer!.payload).toMatchObject({
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce: 'n1',
      kind: 'answer',
      content: 'correct',
      status: 'submitted',
    });
  });

  it('ignores a stage-request aimed at ANOTHER learner (never answers for a peer)', async () => {
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const cor = "azul";', savedAt: new Date().toISOString() })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: 'someone-else', nonce: 'n1' });

    expect(sent.find((s) => s.event === 'stage-answer')).toBeUndefined();
  });
});

describe('useClassSession — pulling work in progress (ADR-4 revised)', () => {
  it('replies with the DRAFT code snapshot when the learner has not submitted yet', async () => {
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const saudacao = "oi";', savedAt: new Date().toISOString() })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    const answer = sent.find((s) => s.event === 'stage-answer');
    expect(answer!.payload).toMatchObject({
      kind: 'code',
      content: 'const saudacao = "oi";',
      status: 'in_progress',
    });
  });

  it('marks the same snapshot as submitted once the learner has answered', async () => {
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const saudacao = "oi";', savedAt: new Date().toISOString() })
    );
    localStorage.setItem(
      `itera.live.answers:${STUDENT}:${SESSION}`,
      JSON.stringify({ [ACTIVITY]: { correct: true, elapsedMs: 900 } })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    expect(sent.find((s) => s.event === 'stage-answer')!.payload).toMatchObject({
      kind: 'code',
      status: 'submitted',
    });
  });

  it('replies with the STARTER on screen before the learner types a single character', async () => {
    // O defeito P1 da aula de 06/08: o snapshot só nasce depois da primeira
    // tecla, então quem tinha só aberto o exercício respondia vazio e a turma
    // via o placeholder — o professor precisava pedir "mexe em algo aí".
    publishCodeLiveBuffer(ACTIVITY, 'const cor = "";', false);
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    expect(sent.find((s) => s.event === 'stage-answer')!.payload).toMatchObject({
      kind: 'code',
      content: 'const cor = "";',
      // `not_started` continua verdade sobre o ALUNO. O que mudou é que ela não
      // implica mais "não há nada pra projetar".
      status: 'not_started',
    });
  });

  it('prefers the live buffer over a stale saved snapshot', async () => {
    // O aluno salvou e continuou digitando: o snapshot no disco é mais VELHO que
    // a tela, porque a escrita é debounced. O palco tem que mostrar a tela.
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'versao velha', savedAt: new Date().toISOString() })
    );
    publishCodeLiveBuffer(ACTIVITY, 'versao na tela', true);
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    expect(sent.find((s) => s.event === 'stage-answer')!.payload).toMatchObject({
      kind: 'code',
      content: 'versao na tela',
      status: 'in_progress',
    });
  });

  it('acabou de clicar em "Recomeçar": projeta o starter, não o rascunho descartado', async () => {
    // Janela real: o `resetToStarter` publica o buffer intocado ANTES de apagar o
    // snapshot, então por um instante os dois existem. Ler o snapshot aqui poria
    // no projetor exatamente o que o aluno acabou de jogar fora.
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'rascunho descartado', savedAt: new Date().toISOString() })
    );
    publishCodeLiveBuffer(ACTIVITY, 'const cor = "";', false);
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    expect(sent.find((s) => s.event === 'stage-answer')!.payload).toMatchObject({
      kind: 'code',
      content: 'const cor = "";',
      status: 'not_started',
    });
  });

  it('a learner who has not started replies with an explicit empty state', async () => {
    // Sem buffer vivo E sem snapshot: nem o editor de código está montado (é
    // outro kind, ou a aba caiu). É o único caso que segue `empty`.
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    const answer = sent.find((s) => s.event === 'stage-answer');
    expect(answer).toBeTruthy();
    expect(answer!.payload).toMatchObject({ kind: 'empty', content: '', status: 'not_started' });
  });

  it('carries the in_progress status through the instructor gate into stage-show', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'code',
      content: 'const cor = "verde";',
      status: 'in_progress',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    expect(sent.find((s) => s.event === 'stage-show')!.payload).toMatchObject({
      status: 'in_progress',
    });
  });

  /**
   * ── O TERMINAL (Tainan, TG 2026-08-10) ────────────────────────────────────
   * Antes disto o `gatherStageContent` não tinha canal nenhum para um
   * `terminal_sandbox`: respondia `empty`, e o palco caía no espelho da
   * atividade — que remonta o renderer no cliente de quem assiste e semeia um
   * terminal limpo. A sala via um prompt vazio com o nome do aluno em cima.
   */
  it('replies with the learner OWN terminal screen, commands included', async () => {
    publishTerminalLiveBuffer(ACTIVITY, terminalScreen(['git checkout -b feat/perfil']), true);
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    const payload = sent.find((s) => s.event === 'stage-answer')!.payload as {
      kind: string;
      status: string;
      terminal: StageTerminalScreen;
    };
    expect(payload.kind).toBe('terminal');
    expect(payload.status).toBe('in_progress');
    expect(payload.terminal.lines.map((l) => l.text)).toEqual(['git checkout -b feat/perfil']);
  });

  it('replies with an UNTOUCHED terminal instead of nothing', async () => {
    // Mesmo raciocínio do starter do `code`: o aluno abriu e está olhando pra
    // uma tela real. `not_started` fala do trabalho, não de "não há o que ver".
    publishTerminalLiveBuffer(ACTIVITY, terminalScreen([]), false);
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    expect(sent.find((s) => s.event === 'stage-answer')!.payload).toMatchObject({
      kind: 'terminal',
      status: 'not_started',
    });
  });

  it('carries the terminal screen through the instructor gate into stage-show', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'terminal',
      content: '',
      status: 'in_progress',
      terminal: terminalScreen(['git status']),
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    const show = sent.find((s) => s.event === 'stage-show')!.payload as {
      terminal: StageTerminalScreen;
    };
    expect(show.terminal.lines.map((l) => l.text)).toEqual(['git status']);
  });

  it('renders a received stage-show terminal into stagedAnswer', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'terminal',
      content: '',
      status: 'in_progress',
      terminal: terminalScreen(['git status']),
      author: { userId: 'other', name: 'Bento', avatarUrl: null },
    });

    expect(result.current.stagedAnswer!.kind).toBe('terminal');
    expect(result.current.stagedAnswer!.terminal!.commandCount).toBe(1);
    expect(result.current.stagedAnswer!.terminal!.lines[0]!.text).toBe('git status');
  });

  it('drops a malformed terminal payload instead of staging it', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'terminal',
      content: '',
      terminal: 'rm -rf /',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    expect(result.current.stagedAnswer!.terminal).toBeUndefined();
  });

  /**
   * ── O CHAT (Tainan, TG 2026-08-10: *"sim conserta p otro sandbox"*) ───────
   * Mesmo buraco do terminal, um kind adiante: sem canal, `gatherStageContent`
   * respondia `empty` e o palco remontava a atividade no cliente de quem
   * assiste — a saudação autorada com o nome do aluno em cima, e nada da
   * conversa dele.
   */
  it('replies with the learner OWN chat conversation, sent turns included', async () => {
    publishChatLiveBuffer(ACTIVITY, chatScreen(['o que é contexto?']), true);
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    const payload = sent.find((s) => s.event === 'stage-answer')!.payload as {
      kind: string;
      status: string;
      chat: StageChatScreen;
    };
    expect(payload.kind).toBe('chat');
    expect(payload.status).toBe('in_progress');
    expect(payload.chat.messages.filter((m) => m.role === 'user').map((m) => m.text)).toEqual([
      'o que é contexto?',
    ]);
  });

  it('replies with an UNTOUCHED chat instead of nothing', async () => {
    publishChatLiveBuffer(ACTIVITY, chatScreen([]), false);
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });

    expect(sent.find((s) => s.event === 'stage-answer')!.payload).toMatchObject({
      kind: 'chat',
      status: 'not_started',
    });
  });

  it('carries the chat conversation through the instructor gate into stage-show', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'chat',
      content: '',
      status: 'in_progress',
      chat: chatScreen(['o que é contexto?']),
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    const show = sent.find((s) => s.event === 'stage-show')!.payload as { chat: StageChatScreen };
    expect(show.chat.messages.some((m) => m.text === 'o que é contexto?')).toBe(true);
  });

  it('renders a received stage-show chat into stagedAnswer', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'chat',
      content: '',
      status: 'in_progress',
      chat: chatScreen(['o que é contexto?']),
      author: { userId: 'other', name: 'Bento', avatarUrl: null },
    });

    expect(result.current.stagedAnswer!.kind).toBe('chat');
    expect(result.current.stagedAnswer!.chat!.sentCount).toBe(1);
    expect(result.current.stagedAnswer!.chat!.messages[1]!.text).toBe('o que é contexto?');
  });

  it('drops a malformed chat payload instead of staging it', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'chat',
      content: '',
      chat: 'nem parece uma conversa',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    expect(result.current.stagedAnswer!.chat).toBeUndefined();
  });

  it('defaults a status-less stage-show to submitted (client on the previous build)', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'answer',
      content: 'correct',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    expect(result.current.stagedAnswer).toMatchObject({ status: 'submitted' });
  });
});

describe('useClassSession — live stage streaming (B3)', () => {
  it('the staged learner re-broadcasts stage-update on autosave', async () => {
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const cor = "azul";', savedAt: new Date().toISOString() })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    // A real pull: the instructor requests ME, I answer, then my work goes on
    // stage → I become the live source.
    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'code',
      content: 'const cor = "azul";',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const cor = "verde";', savedAt: new Date().toISOString() })
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent('itera:code-snapshot-saved', { detail: { activityId: ACTIVITY } })
      );
    });

    const update = sent.find((s) => s.event === 'stage-update');
    expect(update).toBeTruthy();
    expect(update!.payload).toMatchObject({
      activityId: ACTIVITY,
      userId: STUDENT,
      kind: 'code',
      content: 'const cor = "verde";',
    });
  });

  /**
   * O terminal não tem serviço de snapshot pra carona — ele não persiste
   * rascunho —, então carrega o próprio sinal. Sem isto o palco congelaria no
   * instante do puxão e todo comando rodado depois seria invisível pra sala:
   * metade do defeito que um espelho de um tiro só não conserta.
   */
  it('the staged learner re-broadcasts stage-update when a new command runs', async () => {
    publishTerminalLiveBuffer(ACTIVITY, terminalScreen(['git status']), true);
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'terminal',
      content: '',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    act(() => {
      publishTerminalLiveBuffer(
        ACTIVITY,
        terminalScreen(['git status', 'git checkout -b feat/perfil']),
        true,
      );
    });

    const update = sent.find((s) => s.event === 'stage-update')!.payload as {
      kind: string;
      terminal: StageTerminalScreen;
    };
    expect(update.kind).toBe('terminal');
    expect(update.terminal.lines.map((l) => l.text)).toEqual([
      'git status',
      'git checkout -b feat/perfil',
    ]);
  });

  it('does not stream on a terminal that only MOUNTED — hasWork gates the signal', async () => {
    publishTerminalLiveBuffer(ACTIVITY, terminalScreen([]), false);
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'terminal',
      content: '',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    act(() => {
      publishTerminalLiveBuffer(ACTIVITY, terminalScreen([]), false);
    });

    expect(sent.find((s) => s.event === 'stage-update')).toBeUndefined();
    // O evento existe e é o que o `useClassSession` escuta — dispará-lo à mão
    // prova que o silêncio acima veio do `hasWork`, e não de um listener ausente.
    act(() => {
      publishTerminalLiveBuffer(ACTIVITY, terminalScreen(['ls']), true);
    });
    expect(sent.find((s) => s.event === 'stage-update')).toBeTruthy();
    expect(TERMINAL_LIVE_EVENT).toBe('itera:terminal-live');
  });

  /**
   * Igual ao terminal: o chat não persiste rascunho, então carrega o próprio
   * sinal. Sem isto o palco congelaria no instante do puxão e toda mensagem
   * enviada depois seria invisível pra sala.
   */
  it('the staged learner re-broadcasts stage-update when a new message is sent', async () => {
    publishChatLiveBuffer(ACTIVITY, chatScreen(['o que é contexto?']), true);
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'chat',
      content: '',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    act(() => {
      publishChatLiveBuffer(ACTIVITY, chatScreen(['o que é contexto?', 'e agora?']), true);
    });

    const update = sent.find((s) => s.event === 'stage-update')!.payload as {
      kind: string;
      chat: StageChatScreen;
    };
    expect(update.kind).toBe('chat');
    expect(update.chat.messages.filter((m) => m.role === 'user').map((m) => m.text)).toEqual([
      'o que é contexto?',
      'e agora?',
    ]);
  });

  it('does not stream on a chat that only MOUNTED — hasWork gates the signal', async () => {
    publishChatLiveBuffer(ACTIVITY, chatScreen([]), false);
    await mountAs({ userId: STUDENT, isInstructor: false });

    emit('stage-request', { activityId: ACTIVITY, targetUserId: STUDENT, nonce: 'n1' });
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'chat',
      content: '',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    act(() => {
      publishChatLiveBuffer(ACTIVITY, chatScreen([]), false);
    });

    expect(sent.find((s) => s.event === 'stage-update')).toBeUndefined();
    // O evento existe e é o que o `useClassSession` escuta — dispará-lo à mão
    // prova que o silêncio acima veio do `hasWork`, e não de um listener ausente.
    act(() => {
      publishChatLiveBuffer(ACTIVITY, chatScreen(['oi']), true);
    });
    expect(sent.find((s) => s.event === 'stage-update')).toBeTruthy();
    expect(CHAT_LIVE_EVENT).toBe('itera:chat-live');
  });

  it('a NON-staged learner does not stream on autosave', async () => {
    await mountAs({ userId: STUDENT, isInstructor: false });

    // Someone ELSE is on stage.
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'code',
      content: 'x',
      author: { userId: 'other', name: 'Bob', avatarUrl: null },
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('itera:code-snapshot-saved', { detail: { activityId: ACTIVITY } })
      );
    });

    expect(sent.find((s) => s.event === 'stage-update')).toBeUndefined();
  });

  it('a forged stage-show naming me does NOT make me a live source without a real pull', async () => {
    localStorage.setItem(
      `itera.code.snapshot:${STUDENT}:${ACTIVITY}`,
      JSON.stringify({ code: 'const cor = "azul";', savedAt: new Date().toISOString() })
    );
    await mountAs({ userId: STUDENT, isInstructor: false });

    // No stage-request ever arrived — a peer forged a stage-show authored as me.
    emit('stage-show', {
      activityId: ACTIVITY,
      kind: 'code',
      content: 'const cor = "azul";',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent('itera:code-snapshot-saved', { detail: { activityId: ACTIVITY } })
      );
    });

    expect(sent.find((s) => s.event === 'stage-update')).toBeUndefined();
  });

  it('the instructor forwards a matching stage-update as a fresh stage-show', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    // First pull resolves → arms the live subscription.
    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'code',
      content: 'v1',
      status: 'in_progress',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    sent.length = 0;

    emit('stage-update', {
      activityId: ACTIVITY,
      userId: STUDENT,
      kind: 'code',
      content: 'v2',
      status: 'in_progress',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    const show = sent.find((s) => s.event === 'stage-show');
    expect(show!.payload).toMatchObject({ activityId: ACTIVITY, content: 'v2' });
  });

  it('the instructor ignores a stage-update from a non-staged user', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });
    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;
    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'code',
      content: 'v1',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });
    sent.length = 0;

    emit('stage-update', {
      activityId: ACTIVITY,
      userId: 'someone-else',
      kind: 'code',
      content: 'evil',
      author: { userId: 'someone-else', name: 'Mal', avatarUrl: null },
    });

    expect(sent.find((s) => s.event === 'stage-show')).toBeUndefined();
  });
});

describe('useClassSession — restarting the timer lifts the stop lock', () => {
  it('a fresh timer event clears stoppedFor for that activity', async () => {
    const { result } = await mountAs({ userId: STUDENT, isInstructor: false });

    emit('timer-stop', { activity_id: ACTIVITY });
    expect(result.current.stoppedFor).toBe(ACTIVITY);

    emit('timer', { activity_id: ACTIVITY, deadline: Date.now() + 30_000 });
    expect(result.current.stoppedFor).toBeNull();
    expect(result.current.timer).toMatchObject({ activityId: ACTIVITY });
  });

  it('broadcastTimer clears stoppedFor for the professor mirror too', async () => {
    const { result } = await mountAs({ userId: INSTRUCTOR, isInstructor: true });

    emit('timer-stop', { activity_id: ACTIVITY });
    expect(result.current.stoppedFor).toBe(ACTIVITY);

    act(() => result.current.broadcastTimer(ACTIVITY, 30));
    expect(result.current.stoppedFor).toBeNull();
  });
});

describe('useClassSession — an unreachable learner fails loudly', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('resolves the pull to stageUnreachableUserId when nobody replies', async () => {
    const hook = renderHook(() =>
      useClassSession(SESSION, {
        userId: INSTRUCTOR,
        name: INSTRUCTOR,
        avatarUrl: null,
        isInstructor: true,
      })
    );
    // The initial durable read is a resolved promise — flush it under fake timers.
    await act(async () => {
      await Promise.resolve();
    });
    const { result } = hook;

    act(() => result.current.requestStage(STUDENT));
    expect(result.current.stagePendingUserId).toBe(STUDENT);
    expect(result.current.stageUnreachableUserId).toBeNull();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(result.current.stagePendingUserId).toBeNull();
    expect(result.current.stageUnreachableUserId).toBe(STUDENT);
  });

  it('a reply that lands before the timeout clears the pending state instead', async () => {
    const hook = renderHook(() =>
      useClassSession(SESSION, {
        userId: INSTRUCTOR,
        name: INSTRUCTOR,
        avatarUrl: null,
        isInstructor: true,
      })
    );
    await act(async () => {
      await Promise.resolve();
    });
    const { result } = hook;

    act(() => result.current.requestStage(STUDENT));
    const nonce = sent.find((s) => s.event === 'stage-request')!.payload.nonce;

    emit('stage-answer', {
      activityId: ACTIVITY,
      userId: STUDENT,
      nonce,
      kind: 'empty',
      content: '',
      status: 'not_started',
      author: { userId: STUDENT, name: 'Alba', avatarUrl: null },
    });

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(result.current.stagePendingUserId).toBeNull();
    expect(result.current.stageUnreachableUserId).toBeNull();
  });
});
