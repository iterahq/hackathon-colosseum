import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ActivityI18nBridge } from '@/components/branded/activity/IteraActivityHost';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { LiveStage } from '@/components/live/LiveStage';
import { TERMINAL_SANDBOX_SPEC } from '@/stories/contractFixtures';
import { forgetTerminalLiveBuffer } from '@/services/terminalLiveBuffer.service';
import { gatherStageContent } from '@/utils/stageAnswerContent';
import type { Activity } from '@/types/content';
import type { StagedAnswer } from '@/types/liveClass';

/**
 * ── PUXAR PRO PALCO, NUM `terminal_sandbox` ─────────────────────────────────
 * Tainan, TG 2026-08-10: *"puxar pro palco nao ta funfando no sandbox terminal
 * (qndo puxa pro palco não mostra o que o user escreveu no input, e tbm nao
 * mostra o state dele no sandbox)"*.
 *
 * O teste é o CANO INTEIRO e de propósito, porque o defeito não estava em
 * nenhuma das pontas isoladamente: o palco montava a atividade, o renderer
 * montava limpo, e cada peça, sozinha, "funcionava".
 *
 *   aluno monta o terminal → roda comandos
 *     → `gatherStageContent` (o que o cliente dele responde ao puxão)
 *       → `LiveStage` (o que a sala vê)
 *
 * A asserção que importa é sobre COMANDOS ESPECÍFICOS na tela do palco, nunca
 * "renderizou um terminal". Um terminal vazio também renderiza um terminal — era
 * exatamente esse o bug, e é por isso que ele passou despercebido.
 *
 * ⚠️ O mock do `sonner` e do áudio não entram aqui: nada disso monta. O que
 * PRECISA ser real é o `ActivityI18nBridge`, porque é ele que injeta o
 * `liveBuffer`. Sem a porta, o publish do pacote é um no-op silencioso e todo
 * `gatherStageContent` abaixo leria `empty` — ou seja, o teste passaria a
 * afirmar o bug em vez do conserto.
 */

const SESSION = 'sess-1';
const ACTIVITY = 'act-terminal';

const activity: Activity = {
  id: ACTIVITY,
  lessonId: 'lesson-1',
  ordinal: 0,
  kind: 'terminal_sandbox',
  spec: TERMINAL_SANDBOX_SPEC as Record<string, unknown>,
  rubric: null,
};

const author = { userId: 'aluno-1', name: 'Alba', avatarUrl: null };

/** A tela do ALUNO — o cliente dele, montando a atividade de verdade. */
function openLearnerTerminal() {
  return render(
    <I18nProvider>
      <ActivityI18nBridge>
        <ActivityRenderer activity={activity} onComplete={vi.fn()} live />
      </ActivityI18nBridge>
    </I18nProvider>,
  );
}

function runCommand(line: string) {
  const input = screen.getByTestId('terminal-input') as HTMLInputElement;
  fireEvent.change(input, { target: { value: line } });
  fireEvent.keyDown(input, { key: 'Enter' });
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

beforeEach(() => {
  forgetTerminalLiveBuffer(ACTIVITY);
  localStorage.clear();
});
afterEach(cleanup);

describe('live stage — mirroring a terminal_sandbox', () => {
  it('carries the learner commands AND the sandbox output to the pull reply', () => {
    openLearnerTerminal();
    runCommand('git checkout -b feat/perfil');
    runCommand('git status');

    const gathered = gatherStageContent(SESSION, ACTIVITY);
    expect(gathered.kind).toBe('terminal');
    expect(gathered.status).toBe('in_progress');

    const texts = gathered.terminal!.lines.map((l) => l.text);
    // O que ele ESCREVEU.
    expect(texts).toContain('git checkout -b feat/perfil');
    expect(texts).toContain('git status');
    // O que o sandbox RESPONDEU — a outra metade do que Tainan reportou. Vem do
    // engine `git`, então é estado de mundo, não eco.
    expect(texts.some((t) => t.includes('feat/perfil') && !t.startsWith('git '))).toBe(true);
    expect(gathered.terminal!.commandCount).toBe(2);
  });

  it('shows those exact commands on the stage, under the learner name', () => {
    openLearnerTerminal();
    runCommand('git checkout -b feat/perfil');
    const staged = stagedFromLearner();
    cleanup();

    renderStage(staged);
    const mirror = screen.getByTestId('terminal-screen-mirror');
    expect(mirror.textContent).toContain('git checkout -b feat/perfil');
    expect(screen.getByTestId('live-stage-identity').textContent).toContain('Alba');
    expect(screen.getByTestId('live-stage-status').textContent).toContain('Em andamento');
    // O enunciado do passo viaja JUNTO: sem ele quem assiste lê comandos sem
    // saber o que foi pedido. E é o passo em que o ALUNO está — o comando acima
    // liquidou o passo 1, então quem assiste vê o passo 2.
    const instruction = screen.getByTestId('sandbox-instruction').textContent!;
    expect(instruction).toContain('Passo 2/2');
    expect(instruction).toContain('Confirme em qual branch você está');
  });

  /**
   * A REGRESSÃO, escrita como a asserção que faltava.
   *
   * Antes deste PR o palco caía no espelho da atividade, que monta o renderer no
   * cliente de QUEM ASSISTE — `useTerminalSandbox` semeia
   * `initialTerminalModel(scenario)`, ou seja um terminal limpo. Duas coisas
   * provam que isso acabou: o palco NÃO monta a atividade, e o terminal que
   * aparece é o espelho (read-only, sem prompt).
   */
  it('never mounts the activity for a terminal — a mounted renderer is not a mirror', () => {
    openLearnerTerminal();
    runCommand('git checkout -b feat/perfil');
    const staged = stagedFromLearner();
    cleanup();

    renderStage(staged);
    expect(screen.queryByTestId('live-stage-activity')).toBeNull();
    // Sem composer: quem assiste não está jogando o turno do aluno.
    expect(screen.queryByTestId('terminal-input')).toBeNull();
    expect(screen.queryByTestId('terminal-restart')).toBeNull();
    expect(screen.getByTestId('terminal-screen-mirror').dataset.mirrored).toBe('true');
  });

  it('projects an UNTOUCHED terminal as untouched, not as an empty stage', () => {
    openLearnerTerminal();
    const staged = stagedFromLearner();
    expect(staged.kind).toBe('terminal');
    expect(staged.status).toBe('not_started');
    cleanup();

    renderStage(staged);
    expect(screen.getByTestId('live-stage-status').textContent).toContain('Sem edições');
    expect(screen.queryByTestId('live-stage-empty')).toBeNull();
    // A tela dele tem o banner autorado; ela é projetada, e não é chamada de trabalho.
    expect(screen.getByTestId('terminal-screen-mirror').dataset.commandCount).toBe('0');
  });

  /**
   * O aluno saiu da atividade: o buffer é esquecido, e o palco volta a dizer
   * "nada para projetar" em vez de manter no ar uma tela que não existe mais.
   * Um terminal congelado seria pior que o vazio — ele afirma um estado.
   */
  it('stops projecting once the learner leaves the activity', () => {
    const view = openLearnerTerminal();
    runCommand('git checkout -b feat/perfil');
    view.unmount();

    const gathered = gatherStageContent(SESSION, ACTIVITY);
    expect(gathered.kind).toBe('empty');

    renderStage({ activityId: ACTIVITY, ...gathered, author });
    expect(screen.queryByTestId('terminal-screen-mirror')).toBeNull();
    expect(screen.getByTestId('live-stage-empty').textContent).toContain('Nada para projetar');
  });
});
