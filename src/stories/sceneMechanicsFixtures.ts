/**
 * Storybook fixtures for the scene-mechanics batch (`dial`, `plug`,
 * `selector`, `timeline`, `arrange`, `press` — batch A; `wire`, `spot`,
 * `bucket`, `intercept`, `query` — batch B) — plan
 * `20260924-itera-scene-mechanics-kinds`.
 *
 * Specs are the real ported fixtures from `iterahq/activity-spec` PR #54
 * (`src/schemas/fixtures/scene-mechanics/<kind>.json`), first entry per kind.
 *
 * ⚠️ NOT `contractFixtures.ts` / `activityFixtures.ts`'s `makeActivity`. Those
 * type `kind: ActivityKind` against the INSTALLED `@iterahq/activity-spec` —
 * which, in THIS worktree, is the local PR #54 build and already carries all
 * eleven names (see the note in `specs.ts`), but the type still has to
 * survive a future `npm install` of a package version that predates the
 * release. `makeGatedActivity` below is the same shape, with an explicit cast
 * through the eleven names — delete this file and use `makeActivity` directly
 * once the package publishes the release and every consumer is on it.
 */
import type { Activity, ActivityKind } from '@/types/content';

let seq = 0;

export function makeGatedActivity(
  kind: 'dial' | 'plug' | 'selector' | 'timeline' | 'arrange' | 'press' | 'wire' | 'spot' | 'bucket' | 'intercept' | 'query',
  spec: Record<string, unknown>,
  status?: Activity['status'],
): Activity {
  seq += 1;
  return {
    id: `story-${kind}-${seq}`,
    lessonId: 'story-lesson',
    ordinal: 0,
    kind: kind as unknown as ActivityKind,
    spec,
    rubric: null,
    status,
  };
}

export const DIAL_SPEC = {
  prompt: 'A vovó não enxerga esse texto. Aumenta o font-size até ela conseguir ler.',
  reaction: 'Voltou a ser do tamanho de antes — só que agora legível.',
  stamp: 'font-size muda o texto',
  page: { elements: [{ id: 'preco', tag: 'p', text: 'Bolo de Ninho — R$12', name: 'parágrafo' }] },
  target_id: 'preco',
  property: 'font-size',
  unit: 'px',
  min: 12,
  max: 32,
  step: 1,
  start: 12,
  target: [24, 32],
};

export const PLUG_SPEC = {
  prompt: 'Puxa o cabo do style.css e vê a página desmoronar. Recoloca e vê ela sarar.',
  reaction: 'Sem o `<link>`, o navegador só tem o HTML cru — nenhuma cor sobrevive.',
  stamp: 'link conecta o CSS',
  page: {
    elements: [
      { id: 'titulo', tag: 'h1', text: 'Tera', name: 'título' },
      { id: 'intro', tag: 'p', text: 'Faço bolo de pote.', name: 'parágrafo' },
    ],
  },
  stylesheet: [
    { target_id: 'titulo', property: 'font-size', value: '42px' },
    { target_id: 'intro', property: 'color', value: '#6B4452' },
  ],
  cable_name: 'style.css',
  on_label: 'conectado — o navegador lê o style.css',
  off_label: 'desconectado — sobrou só o HTML cru',
};

export const SELECTOR_SPEC = {
  prompt: 'Quero pintar só o parágrafo da minha página de rosa. Testa os seletores até acertar.',
  reaction: 'Um seletor de tag acende TODOS os elementos daquela tag — aqui só tinha um parágrafo mesmo.',
  stamp: 'tag acende por nome',
  elements: [
    { id: 'titulo', tag: 'h1', classes: [] },
    { id: 'intro', tag: 'p', classes: [] },
    { id: 'link', tag: 'a', classes: [] },
    { id: 'botao', tag: 'button', classes: [] },
  ],
  options: ['h1', 'p', 'a', 'button'],
  targets: ['intro'],
  rule: { property: 'color', value: '#DB2777' },
};

export const TIMELINE_SPEC = {
  prompt: 'Anda pelos commits e vê o arquivo mudando de estado.',
  reaction: 'Cada commit é uma foto — o histórico é a fita inteira.',
  stamp: 'commit é uma foto no tempo',
  axis: 'commit',
  steps: [
    { label: 'commit 1', note: 'cria o arquivo vazio.', frame: { type: 'code', lines: ['// carrinho.js'] } },
    { label: 'commit 2', note: 'adiciona a função de total.', frame: { type: 'code', lines: ['// carrinho.js', 'function total() {}'] } },
    {
      label: 'commit 3',
      note: 'implementa a soma.',
      frame: { type: 'code', lines: ['// carrinho.js', 'function total(a, b) {', '  return a + b;', '}'] },
    },
  ],
};

export const ARRANGE_SPEC = {
  prompt: 'Arrasta os passos até a transação de banco rodar na ordem certa.',
  reaction: 'Confirmar antes de checar saldo é como assinar um cheque sem olhar a conta.',
  stamp: 'transação tem ordem',
  items: [
    { id: 'checar-saldo', label: 'checar o saldo' },
    { id: 'debitar', label: 'debitar o valor' },
    { id: 'confirmar', label: 'confirmar a transação' },
  ],
  correct: ['checar-saldo', 'debitar', 'confirmar'],
  start: ['confirmar', 'checar-saldo', 'debitar'],
  item_style: 'card',
};

export const PRESS_SPEC = {
  prompt: 'O botão está morto. Escolhe a reação certa e liga o handler.',
  reaction: 'onClick liga a função ao clique — sem ele o botão é só um retângulo.',
  stamp: 'onClick liga o gesto ao código',
  file: 'botao.js',
  before: ['let cliques = 0;'],
  options: [
    { id: 'onclick', label: 'somar 1 a cada clique', code: 'botao.onclick = () => cliques++;' },
    { id: 'oninput', label: 'somar 1 a cada tecla digitada', code: 'botao.oninput = () => cliques++;' },
  ],
  correct: 'onclick',
  wrong_hint: 'esse evento não dispara quando você clica um botão.',
  button: 'clica aqui',
  goal: 3,
  effect: { type: 'counter' },
};
