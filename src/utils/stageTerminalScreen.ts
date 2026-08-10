/**
 * A tela de terminal que PODE atravessar o broadcast do palco — e a leitura
 * dela do outro lado.
 *
 * Mesma disciplina do `stageResponseText`, e pelos mesmos dois motivos, que são
 * diferentes um do outro:
 *
 *  1. **Banda.** A tela sai da aba do aluno, passa pelo Realtime do Supabase e
 *     chega em TODO mundo na sala. Uma sessão longa (um `git log` de projeto
 *     real, um engine falante) produz centenas de linhas, e o payload do
 *     broadcast tem teto. Sem corte, o evento é DESCARTADO inteiro — o palco não
 *     degrada, ele para, e ninguém na sala descobre por quê.
 *  2. **Leitura.** O que interessa no palco é o FIM da sessão: os últimos
 *     comandos e o que o sandbox respondeu. Cortar pelo começo preserva
 *     exatamente isso.
 *
 * ⚠️ O corte é pelo COMEÇO, nunca pelo fim, e os índices de `successLines` são
 * REBASEADOS junto. Um índice não rebaseado apontaria pra outra linha depois do
 * corte e o ✓ apareceria no lugar errado — pior que ausente, porque afirma que
 * um comando que não completou passo completou.
 *
 * ── O QUE ISTO **NÃO** É ────────────────────────────────────────────────────
 * Não é a regra do trace. `command_run.command` vai pro `itera.activity_traces`
 * **normalizado**, e essa carve-out (`FREE_TEXT_PAYLOAD_CARVE_OUTS`) continua
 * intacta e não foi alargada. Isto aqui é o ESPELHO AO VIVO: efêmero,
 * peer-to-peer, nada gravado, e é a mesma superfície que já projeta o código
 * cru que o aluno digitou quando ele é puxado num `code`. Projetar a tela e
 * gravar o histórico são duas decisões separadas; esta PR mexe só na primeira.
 */
import type { ActivityTerminalLine, ActivityTerminalScreen } from '@iterahq/activities';

/**
 * Quantas linhas do FIM da transcrição viajam. 120 linhas × ~120 chars cabem
 * com folga no envelope do broadcast e cobrem qualquer roteiro autorado hoje
 * (o maior tem 5 passos).
 */
export const STAGE_TERMINAL_MAX_LINES = 120;
/** Teto por linha. Uma saída de engine ou um `cannedOutput` colado não estoura. */
export const STAGE_TERMINAL_MAX_LINE_CHARS = 400;
/** Teto do enunciado do passo, que viaja junto com a transcrição. */
export const STAGE_TERMINAL_MAX_PROMPT = 400;

const LINE_KINDS = new Set(['cmd', 'out', 'err']);

function clampText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Prepara a tela local pro broadcast: corta o começo e rebaseia os ✓. */
export function clampStageTerminal(screen: ActivityTerminalScreen): ActivityTerminalScreen {
  const total = screen.lines.length;
  const dropped = Math.max(0, total - STAGE_TERMINAL_MAX_LINES);
  const lines = screen.lines.slice(dropped).map((line) => ({
    kind: line.kind,
    text: clampText(line.text, STAGE_TERMINAL_MAX_LINE_CHARS),
  }));
  return {
    lines,
    ps1: clampText(screen.ps1, 80),
    windowTitle: clampText(screen.windowTitle, 80),
    successLines: screen.successLines
      .map((i) => i - dropped)
      .filter((i) => i >= 0 && i < lines.length),
    stepIdx: Math.max(0, Math.trunc(screen.stepIdx)),
    stepCount: Math.max(0, Math.trunc(screen.stepCount)),
    stepPrompt: screen.stepPrompt ? clampText(screen.stepPrompt, STAGE_TERMINAL_MAX_PROMPT) : null,
    won: screen.won === true,
    commandCount: Math.max(0, Math.trunc(screen.commandCount)),
  };
}

/**
 * Lê a tela de um payload que veio da REDE. Fail-closed: qualquer coisa fora de
 * forma vira `undefined`, e o palco cai no estado vazio explicado em vez de
 * renderizar lixo com o nome de um aluno em cima.
 *
 * O teto é reaplicado aqui de propósito — quem envia pode ser um cliente de
 * outra build, e é este lado que renderiza.
 */
export function parseStageTerminal(value: unknown): ActivityTerminalScreen | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.lines)) return undefined;
  const lines: ActivityTerminalLine[] = [];
  for (const item of raw.lines) {
    if (!item || typeof item !== 'object') continue;
    const line = item as Record<string, unknown>;
    if (typeof line.text !== 'string') continue;
    const kind = LINE_KINDS.has(line.kind as string) ? (line.kind as ActivityTerminalLine['kind']) : 'out';
    lines.push({ kind, text: line.text });
  }
  const successLines = Array.isArray(raw.successLines)
    ? raw.successLines.filter((i): i is number => typeof i === 'number' && Number.isInteger(i))
    : [];
  return clampStageTerminal({
    lines,
    ps1: typeof raw.ps1 === 'string' ? raw.ps1 : '',
    windowTitle: typeof raw.windowTitle === 'string' ? raw.windowTitle : '',
    successLines,
    stepIdx: typeof raw.stepIdx === 'number' ? raw.stepIdx : 0,
    stepCount: typeof raw.stepCount === 'number' ? raw.stepCount : 0,
    stepPrompt: typeof raw.stepPrompt === 'string' ? raw.stepPrompt : null,
    won: raw.won === true,
    commandCount: typeof raw.commandCount === 'number' ? raw.commandCount : 0,
  });
}
