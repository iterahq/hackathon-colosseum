// What an OPERATOR needs to play a day through the API: the authored activities read with psql
// (answer key included) and the submission a learner who knows the answer would send. The browser
// receives none of this before a verdict; scripts that prove an honest path use it on purpose.
import { resolveSpec } from '../../supabase/functions/_shared/grading.ts';
import { psql } from './social-e2e.lib.mjs';

const BLANK_TOKEN = /\{\{blank:([^{}]*)\}\}/g;

/** Day 1 of `itera-v2`: what a learner would type in its three code exercises. */
export const CODE_SOLUTIONS = {
  '63954b30-7fd3-45a6-a9b8-98d724482b11': '<h1>Oi, eu sou o Tera</h1>\n<h2>Sabores</h2>\n<h3>Ninho</h3>\n<h3>Chocolate</h3>\n<h2>Como encomendar</h2>\n',
  '0a83bb49-5f13-4481-82c7-09cf9c62f884':
    '<!DOCTYPE html>\n<html>\n<head>\n<title>Ana</title>\n</head>\n<body>\n<h1>Ana</h1>\n<h2>Sobre mim</h2>\n<p>Estou aprendendo HTML.</p>\n</body>\n</html>\n',
  '65cbc1f8-8f19-4348-a4dc-41634f30cc86':
    '<!DOCTYPE html>\n<html>\n<head>\n<title>Ana</title>\n</head>\n<body>\n<h1>Ana</h1>\n<h2>Sobre mim</h2>\n<p>Gosto de aprender.</p>\n<h2>Minhas metas</h2>\n</body>\n</html>\n',
};

export function firstLessonOf(programSlug = 'itera-v2') {
  return psql(
    `select l.id from itera.programs p join itera.units u on u.program_id = p.id join itera.lessons l on l.unit_id = u.id
     where p.slug = :'slug' and exists (select 1 from itera.activities a where a.lesson_id = l.id and a.status = 'published')
     order by u.ordinal, l.ordinal, l.id limit 1;`,
    { slug: programSlug },
  );
}

/** The published activities of a lesson as authored, answer key included. Read with the database password, never with a browser key. */
export function authoredLesson(lessonId) {
  return JSON.parse(
    psql(`select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'spec', spec) order by ordinal, id), '[]') from itera.activities where lesson_id = :'lesson'::uuid and status = 'published';`, { lesson: lessonId }),
  );
}

/** The gestures a learner ends a scene kind with, as the player records them. */
export function gestureTrace(activity) {
  const spec = activity.spec;
  let at = Date.now() - 20_000;
  const act = (type, payload) => ({ type, at: (at += 700), ...(payload ? { payload } : {}) });
  const ids = (list) => (Array.isArray(list) ? list.map((item) => item.id) : []);
  switch (activity.kind) {
    case 'xray':
      return [act('gate_opened', { coverage_goal: spec.coverage_goal ?? 0.7 })];
    case 'inspect': {
      const elements = ids(spec.page?.elements);
      return [...elements.map((id) => act('element_found', { element_id: id })), act('gate_opened', { found: elements.length })];
    }
    case 'spot':
      return [...ids(spec.bugs).map((id) => act('element_found', { element_id: id })), act('gate_opened', { bugs: spec.bugs.length })];
    case 'timeline':
      return [...spec.steps.slice(1).map((_, index) => act('step_visited', { index: index + 1 })), act('gate_opened', { steps: spec.steps.length })];
    case 'selector':
      return [act('option_picked', { option: spec.options?.[0] }), act('gate_opened', { option: spec.options?.[0] })];
    case 'arrange':
      return [act('order_changed', { order: spec.correct }), act('gate_opened', { order: spec.correct })];
    case 'press':
      return [...Array.from({ length: spec.goal ?? 1 }, (_, index) => act('pressed', { count: index + 1 })), act('gate_opened', { presses: spec.goal ?? 1 })];
    case 'dial': {
      const value = Array.isArray(spec.target) ? spec.target[0] : spec.target;
      return [act('value_set', { value }), act('gate_opened', { value })];
    }
    case 'wire':
      return [...spec.pairs.map((pair) => act('wire_connected', { left_id: pair.left_id, right_id: pair.right_id })), act('gate_opened', { pairs: spec.pairs.length })];
    case 'intercept':
      return [act('gate_opened', { node_id: spec.answer })];
    case 'bucket':
      return [...spec.chips.map((chip) => act('chip_placed', { chip_id: chip.id, bucket_id: chip.bucket })), act('gate_opened', { chips: spec.chips.length })];
    case 'plug':
      return [act('cable_toggled', { connected: false }), act('cable_toggled', { connected: true }), act('gate_opened', { cable: spec.cable_name })];
    default:
      return null;
  }
}

/** The correct submission for an authored activity, built the way the player builds it. */
export function correctSubmission(activity, lang = 'pt') {
  const spec = resolveSpec(activity.spec, lang);
  switch (activity.kind) {
    case 'single_choice':
      return { answer: { option_ids: [spec.correct_option_id] }, response: null };
    case 'multi_choice':
      return { answer: { option_ids: spec.correct_option_ids }, response: null };
    case 'order':
      return { answer: { order: spec.correct_order }, response: null };
    case 'match':
      return { answer: { pairs: spec.pairs.map((pair) => [pair.left_id, pair.right_id]) }, response: null };
    case 'code_fill_type':
    case 'code_fill_bank':
    case 'code_fill_select': {
      const answers = new Map(spec.blanks.map((blank) => [blank.id, blank.answer.trim()]));
      return { answer: { blanks: Object.fromEntries(answers) }, response: spec.starter.replace(BLANK_TOKEN, (token, id) => (answers.has(id) ? answers.get(id) : token)) };
    }
    case 'code_editor_checks':
      return { answer: null, response: CODE_SOLUTIONS[activity.id] ?? spec.starter };
    default: {
      const trace = gestureTrace({ ...activity, spec });
      return { answer: null, response: null, ...(trace ? { trace } : {}) };
    }
  }
}

const withoutId = (item) => JSON.stringify(Object.fromEntries(Object.entries(item).filter(([name]) => name !== 'id').sort(([a], [b]) => a.localeCompare(b))));

/**
 * Authored id -> the id the SERVED (sealed) copy of the activity shows for the same option, item or
 * card, matched by everything but the id. This is how a robot that knows the answer finds it on the
 * page: the page itself never says which one it is.
 */
export function servedIds(authored, served) {
  const map = new Map();
  for (const list of ['options', 'items', 'left', 'right']) {
    const shown = Array.isArray(served?.spec?.[list]) ? served.spec[list] : [];
    for (const item of Array.isArray(authored.spec?.[list]) ? authored.spec[list] : []) {
      const match = shown.find((candidate) => withoutId(candidate) === withoutId(item));
      map.set(item.id, match ? match.id : item.id);
    }
  }
  return map;
}

/** The lesson as the learner's own session receives it from the `lesson` function. */
export async function servedLesson(functionsUrl, headers, lessonId) {
  const response = await fetch(`${functionsUrl}/lesson`, { method: 'POST', headers, body: JSON.stringify({ lesson_id: lessonId }) });
  if (!response.ok) throw new Error(`lesson function: HTTP ${response.status}`);
  return (await response.json()).activities ?? [];
}
