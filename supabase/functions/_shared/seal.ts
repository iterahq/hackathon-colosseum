/**
 * What a learner's browser receives of an activity before a verdict, and what
 * `grade` hands back after one.
 *
 * `sealActivity` removes every field the grader compares an answer against and
 * every arrangement that gives the answer away (authored order, aligned
 * columns, ids such as "certo"). `unsealAnswer` turns the ids a sealed spec
 * carries back into the authored ones. `answerKey` is the removed part in the
 * sealed spec's own ids: it leaves the server only with a passing verdict.
 */
import { canonicalJson, gradingMode, resolveSpec } from './grading.ts';
import { sha256Hex } from './sha256.ts';

type Json = Record<string, unknown>;

export type GradedBy = 'server' | 'browser' | 'none';

export interface ActivityContent {
  id: string;
  kind: string;
  spec: unknown;
}

export interface SealedActivity {
  spec: unknown;
  graded_by: GradedBy;
  /** The spec lost its answer fields; the browser asks `grade` for every verdict. */
  sealed: boolean;
  /** `match`: how many pairs the learner must make. */
  pair_count?: number;
}

const CHOICE = new Set(['single_choice', 'multi_choice']);
const FILL = new Set(['code_fill_type', 'code_fill_bank', 'code_fill_select']);
const SEALED_KINDS = new Set([...CHOICE, 'order', 'match', ...FILL, 'code_editor_checks']);
const REFERENCE_LABEL = /^\(?\**\s*([A-Za-z]|\d{1,2})\s*\**[).:]?\)?$/;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const objects = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);

function without(source: Json, keys: readonly string[]): Json {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));
}

function tag(secret: string, activityId: string, text: string): string {
  return sha256Hex(`${secret}\n${activityId}\n${text}`);
}

/** The id a sealed spec shows for an authored id. Stable per activity, meaningless without the secret. */
export function sealedId(secret: string, activityId: string, id: string): string {
  return `s${tag(secret, activityId, `id:${id}`).slice(0, 10)}`;
}

function byTag<T>(items: readonly T[], secret: string, activityId: string, textOf: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, order: tag(secret, activityId, `order:${textOf(item)}`) }))
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
    .map(({ item }) => item);
}

function rotated<T>(items: readonly T[]): T[] {
  return items.length < 2 ? [...items] : [...items.slice(1), items[0]];
}

/** Options labelled only "A", "B", "1"… point at blocks of the prompt: their order is part of the question. */
function isReferenceSet(options: readonly Json[]): boolean {
  if (options.length < 2) return false;
  return options.every((option) => {
    const label = resolveSpec(option.label, 'pt');
    return !option.image_url && !option.audio_url && typeof label === 'string' && REFERENCE_LABEL.test(label.trim());
  });
}

function reId(items: readonly Json[], secret: string, activityId: string): Json[] {
  return items.map((item) => (typeof item.id === 'string' ? { ...item, id: sealedId(secret, activityId, item.id) } : item));
}

function sealChoice(spec: Json, secret: string, activityId: string): Json {
  const options = objects(spec.options);
  const shown = isReferenceSet(options) ? options : byTag(options, secret, activityId, (option) => String(option.id));
  return { ...without(spec, ['correct_option_id', 'correct_option_ids', 'explanation']), options: reId(shown, secret, activityId) };
}

function sealOrder(spec: Json, secret: string, activityId: string): Json {
  const items = objects(spec.items);
  const expected = Array.isArray(spec.correct_order) ? spec.correct_order : [];
  let shown = byTag(items, secret, activityId, (item) => String(item.id));
  if (shown.length > 1 && shown.every((item, index) => item.id === expected[index])) shown = rotated(shown);
  return { ...without(spec, ['correct_order', 'explanation']), items: reId(shown, secret, activityId) };
}

function sealMatch(spec: Json, secret: string, activityId: string): Json {
  const left = objects(spec.left);
  const pairs = objects(spec.pairs);
  let right = byTag(objects(spec.right), secret, activityId, (item) => String(item.id));
  const aligned = (candidate: readonly Json[]) =>
    left.every((item, index) => pairs.some((pair) => pair.left_id === item.id && pair.right_id === candidate[index]?.id));
  if (right.length > 1 && aligned(right)) right = rotated(right);
  return {
    ...without(spec, ['pairs', 'explanation']),
    left: reId(left, secret, activityId),
    right: reId(right, secret, activityId),
  };
}

function unique(values: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = canonicalJson(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sealFill(spec: Json, secret: string, activityId: string): Json {
  const blanks = objects(spec.blanks);
  const shuffle = (values: readonly unknown[]) => byTag(unique(values), secret, activityId, canonicalJson);
  const hasBank = blanks.some((blank) => blank.kind === 'bank');
  const authoredBank = Array.isArray(spec.word_bank) && spec.word_bank.length > 0 ? spec.word_bank : null;
  const bank = authoredBank ?? blanks.filter((blank) => blank.kind === 'bank').flatMap((blank) => [blank.answer, ...(Array.isArray(blank.options) ? blank.options : [])]);
  const sealedBlanks = blanks.map((blank) => {
    const open = without(blank, ['answer', 'accept', 'options']);
    if (blank.kind !== 'select') return open;
    return { ...open, options: shuffle([blank.answer, ...(Array.isArray(blank.options) ? blank.options : [])]) };
  });
  return { ...without(spec, ['word_bank']), blanks: sealedBlanks, ...(hasBank ? { word_bank: shuffle(bank) } : {}) };
}

function sealChecks(spec: Json): Json {
  return { ...spec, checks: objects(spec.checks).map((check) => without(check, ['selector', 'assert', 'steps'])) };
}

function gradedBy(kind: string, spec: unknown): GradedBy {
  const mode = gradingMode(kind, spec);
  return mode === 'server' ? 'server' : mode === 'participation' ? 'none' : 'browser';
}

export function sealActivity(activity: ActivityContent, secret: string): SealedActivity {
  const by = gradedBy(activity.kind, activity.spec);
  const spec = activity.spec;
  if (by !== 'server' || !SEALED_KINDS.has(activity.kind) || !isObject(spec)) return { spec, graded_by: by, sealed: false };
  if (CHOICE.has(activity.kind)) return { spec: sealChoice(spec, secret, activity.id), graded_by: by, sealed: true };
  if (activity.kind === 'order') return { spec: sealOrder(spec, secret, activity.id), graded_by: by, sealed: true };
  if (activity.kind === 'match') {
    return { spec: sealMatch(spec, secret, activity.id), graded_by: by, sealed: true, pair_count: objects(spec.pairs).length };
  }
  if (FILL.has(activity.kind)) return { spec: sealFill(spec, secret, activity.id), graded_by: by, sealed: true };
  return { spec: sealChecks(spec), graded_by: by, sealed: true };
}

function authoredIds(kind: string, spec: Json): string[] {
  const lists = CHOICE.has(kind) ? [spec.options] : kind === 'order' ? [spec.items] : kind === 'match' ? [spec.left, spec.right] : [];
  return lists.flatMap((list) => objects(list).map((item) => item.id)).filter((id): id is string => typeof id === 'string');
}

/**
 * The submitted answer in authored ids. An id that is not a sealed one passes
 * through untouched, so an answer recorded before the seal still grades.
 */
export function unsealAnswer(activity: ActivityContent, answer: unknown, secret: string): unknown {
  if (!isObject(activity.spec) || !isObject(answer)) return answer;
  const back = new Map(authoredIds(activity.kind, activity.spec).map((id) => [sealedId(secret, activity.id, id), id]));
  if (back.size === 0) return answer;
  const real = (value: unknown): unknown => (typeof value === 'string' ? (back.get(value) ?? value) : Array.isArray(value) ? value.map(real) : value);
  return {
    ...answer,
    ...('option_ids' in answer ? { option_ids: real(answer.option_ids) } : {}),
    ...('order' in answer ? { order: real(answer.order) } : {}),
    ...('pairs' in answer ? { pairs: real(answer.pairs) } : {}),
  };
}

/** The removed part of a sealed choice spec, in sealed ids. Sent only with a passing verdict. */
export function answerKey(activity: ActivityContent, secret: string): Json | null {
  const spec = activity.spec;
  if (!isObject(spec)) return null;
  const seal = (id: unknown) => (typeof id === 'string' ? sealedId(secret, activity.id, id) : id);
  if (activity.kind === 'single_choice') return { correct_option_id: seal(spec.correct_option_id) };
  if (activity.kind === 'multi_choice') return { correct_option_ids: Array.isArray(spec.correct_option_ids) ? spec.correct_option_ids.map(seal) : [] };
  if (activity.kind === 'order') return { correct_order: Array.isArray(spec.correct_order) ? spec.correct_order.map(seal) : [] };
  if (activity.kind === 'match') {
    return { pairs: objects(spec.pairs).map((pair) => ({ left_id: seal(pair.left_id), right_id: seal(pair.right_id) })) };
  }
  return null;
}

/** The authored explanation of a choice activity, both languages as written. Sent with any verdict, never before one. */
export function explanationOf(activity: ActivityContent): unknown {
  return isObject(activity.spec) && activity.spec.explanation !== undefined ? activity.spec.explanation : null;
}
