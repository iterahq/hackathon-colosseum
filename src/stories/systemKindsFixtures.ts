/**
 * Storybook fixtures for the system kinds (`decompose_canvas`, `compose_blocks`,
 * `state_lab`, `event_trace`, 2026-09-30) — the canonical Task List of Tainan's
 * Week 1 proposal, seen through four lenses.
 *
 * Specs are the sibling `@iterahq/activity-spec` fixtures
 * (`src/schemas/fixtures/system-kinds/<kind>.json`), first entry per kind; the
 * shared view and state are factored out instead of repeated three times.
 */
import type { Activity } from '@/types/content';

let seq = 0;

export function makeSystemActivity(
  kind: 'decompose_canvas' | 'compose_blocks' | 'state_lab' | 'event_trace',
  spec: Record<string, unknown>,
  status?: Activity['status'],
): Activity {
  seq += 1;
  return {
    id: `story-${kind}-${seq}`,
    lessonId: 'story-lesson',
    ordinal: 0,
    kind,
    spec,
    rubric: null,
    status,
  };
}

const tasks = (done: [boolean, boolean, boolean]) => [
  { title: 'Comprar café', done: done[0] },
  { title: 'Revisar proposta', done: done[1] },
  { title: 'Estudar React', done: done[2] },
];

export const TASK_LIST_STATE = { tasks: tasks([false, false, false]) };

export const TASK_LIST_VIEW = {
  id: 'app',
  type: 'box',
  children: [
    { id: 'title', type: 'heading', text: 'Minhas tarefas' },
    {
      id: 'add',
      type: 'box',
      children: [
        { id: 'new', type: 'input', placeholder: 'Nova tarefa' },
        { id: 'add_btn', type: 'button', text: 'Adicionar' },
      ],
    },
    {
      id: 'list',
      type: 'list',
      bind: 'tasks',
      empty: 'Nenhuma tarefa',
      item: { id: 'item', type: 'checkbox_item', text: { bind: 'title' }, checked: { bind: 'done' } },
    },
  ],
};

export const DECOMPOSE_CANVAS_SPEC = {
  guide: { name: 'Duda' },
  prompt: 'Seleciona os elementos que andam juntos e dá um nome a cada parte da tela.',
  reaction: 'Cada parte tem um trabalho só: mostrar, adicionar ou listar.',
  stamp: 'decomposição',
  wrong_hint: 'Essa divisão ainda mistura partes com trabalhos diferentes.',
  view: TASK_LIST_VIEW,
  state: TASK_LIST_STATE,
  parts: [
    { id: 'header', label: 'Cabeçalho' },
    { id: 'add', label: 'Adicionar tarefa' },
    { id: 'list', label: 'Lista de tarefas' },
    { id: 'item', label: 'Item da tarefa', inside: 'list' },
  ],
  must_group: [
    { ids: ['new', 'add_btn'], hint: 'O campo e o botão formam uma parte só: adicionar tarefa.' },
    { ids: ['item#0', 'item#1', 'item#2'], hint: 'Todas as tarefas são o mesmo tipo de item.' },
  ],
  must_separate: [
    { ids: ['title', 'new'], hint: 'O título não faz parte de adicionar tarefa.' },
    { ids: ['add_btn', 'item#0'], hint: 'O botão e a lista têm trabalhos diferentes.' },
  ],
};

export const COMPOSE_BLOCKS_SPEC = {
  guide: { name: 'Duda' },
  prompt: 'Monta a tela de tarefas encaixando os blocos, do maior para o menor.',
  reaction: 'A tela é feita de blocos dentro de blocos.',
  stamp: 'composição',
  wrong_hint: 'Esse bloco não pertence a esse lugar.',
  blocks: [
    { id: 'app', label: 'App', view: { id: 'app', type: 'box', children: [] } },
    { id: 'header', label: 'Cabeçalho', view: { id: 'header', type: 'heading', text: 'Minhas tarefas' } },
    {
      id: 'add_form',
      label: 'Adicionar tarefa',
      view: {
        id: 'add_form',
        type: 'box',
        children: [
          { id: 'new', type: 'input', placeholder: 'Nova tarefa' },
          { id: 'add_btn', type: 'button', text: 'Adicionar' },
        ],
      },
    },
    { id: 'task_list', label: 'Lista de tarefas', view: { id: 'task_list', type: 'box', children: [] } },
    {
      id: 'task_item',
      label: 'Item da tarefa',
      view: { id: 'task_item', type: 'checkbox_item', text: { bind: 'title' }, checked: { bind: 'done' } },
      max: 3,
    },
  ],
  root: 'app',
  target: {
    block: 'app',
    children: [
      { block: 'header' },
      { block: 'add_form' },
      { block: 'task_list', children: [{ block: 'task_item' }, { block: 'task_item' }] },
    ],
  },
  sibling_order_matters: false,
  item_style: 'card',
};

export const STATE_LAB_SPEC = {
  guide: { name: 'Duda' },
  prompt: 'Mexe no estado e vê a tela mudar. Deixa as duas primeiras tarefas concluídas.',
  reaction: 'A tela é só o estado desenhado: muda o dado, muda o desenho.',
  stamp: 'estado vira tela',
  state: TASK_LIST_STATE,
  view: TASK_LIST_VIEW,
  controls: [
    { id: 'toggle_first', path: 'tasks.0.done', type: 'toggle', label: 'Comprar café concluída' },
    { id: 'toggle_second', path: 'tasks.1.done', type: 'toggle', label: 'Revisar proposta concluída' },
    {
      id: 'add_task',
      path: 'tasks',
      type: 'add_item',
      label: 'Adicionar tarefa',
      template: { title: 'Nova tarefa', done: false },
    },
    { id: 'remove_task', path: 'tasks', type: 'remove_item', label: 'Remover última tarefa' },
  ],
  goals: [
    { path: 'tasks.0.done', equals: true, label: 'Comprar café está concluída' },
    { path: 'tasks.1.done', equals: true, label: 'Revisar proposta está concluída' },
  ],
};

export const EVENT_TRACE_SPEC = {
  guide: { name: 'Duda' },
  prompt: 'Clica na primeira tarefa e acompanha o que acontece, passo a passo.',
  reaction: 'Um clique vira ação, a ação muda o estado e o estado redesenha a tela.',
  stamp: 'causa e efeito',
  state: TASK_LIST_STATE,
  view: TASK_LIST_VIEW,
  trigger: { node: 'item#0' },
  steps: [
    { id: 'event', lens: 'event', label: 'click', highlight: 'item#0' },
    { id: 'action', lens: 'action', label: 'completeTask', highlight: 'item#0' },
    {
      id: 'state',
      lens: 'state',
      label: 'done: false → true',
      highlight: 'list',
      state_after: { tasks: tasks([true, false, false]) },
    },
    { id: 'render', lens: 'render', label: 'a tarefa aparece marcada', highlight: 'item#0' },
  ],
  lenses: ['structure', 'state', 'flow'],
};
