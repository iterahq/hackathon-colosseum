/**
 * Server-side grading. The learner's answer is judged here against the spec the
 * server read, with the same rules the player applies in the browser
 * (`packages/activities`): a completion exists only when this module says so.
 *
 * `gradingMode` is a function of the activity alone, never of the submission:
 * a learner cannot move an activity out of `server` by what they send.
 */

export const GRADER_VERSION = 'v1';

/**
 * `server`: graded here. `self_reported`: the kind needs a browser (a gesture,
 * computed style, a simulated click) and the client's claim is recorded as a
 * claim. `participation`: there is nothing to grade.
 */
export type GradeMode = 'server' | 'self_reported' | 'participation';

export interface Submission {
  /** What the learner submitted, as the player's `answer_submitted` action carries it. */
  answer: unknown;
  /** The player's text of the answer: for code kinds, the whole source. */
  response: string | null;
}

/** The part of a parsed HTML document the checks read. */
export interface HtmlDocument {
  count(selector: string): number;
  /** `textContent` of the first match, `null` when nothing matches. */
  text(selector: string): string | null;
  /** The attribute of the first match, `null` when there is no match or no attribute. */
  attr(selector: string, name: string): string | null;
}

export type HtmlParser = (source: string) => HtmlDocument;

export type GradeReason = 'answer_required' | 'answer_rejected' | 'invalid_spec' | 'trace_required' | 'trace_rejected';

export interface Grade {
  mode: GradeMode;
  passed: boolean;
  reason?: GradeReason;
}

type Json = Record<string, unknown>;

const PARTICIPATION_KINDS = new Set([
  'concept',
  'concept_reveal',
  'code_editor_ungraded',
  'video',
  'document',
  'document_read',
  'diagram',
]);
const CHOICE_KINDS = new Set(['single_choice', 'multi_choice', 'order', 'match']);
const FILL_KINDS = new Set(['code_fill_type', 'code_fill_bank', 'code_fill_select']);
/** Asserts that read the parsed tree or the source text. `style` needs layout and is not here. */
const STATIC_ASSERTS = new Set(['count', 'exists', 'text', 'class', 'attr', 'closes', 'source_has']);
const LOCALES = ['pt', 'en'] as const;
const BLANK_TOKEN = /\{\{blank:([^{}]*)\}\}/g;
const MAX_ANSWER_COMBINATIONS = 64;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

function isLocaleBag(value: Json): boolean {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => (key === 'pt' || key === 'en') && typeof value[key] === 'string');
}

/** The spec as the player renders it in one language: every `{ pt, en }` bag collapsed, `pt` as fallback. */
export function resolveSpec(value: unknown, locale: 'pt' | 'en'): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveSpec(item, locale));
  if (!isObject(value)) return value;
  if (isLocaleBag(value)) return value[locale] ?? value.pt ?? value.en ?? '';
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveSpec(item, locale)]));
}

function checksOf(spec: unknown): Json[] {
  const checks = isObject(spec) ? spec.checks : null;
  return Array.isArray(checks) ? checks.filter(isObject) : [];
}

function isStaticCheck(check: Json): boolean {
  const steps = check.steps;
  if (Array.isArray(steps) && steps.length > 0) return false;
  return isObject(check.assert) && typeof check.assert.type === 'string' && STATIC_ASSERTS.has(check.assert.type);
}

/** Checks that pass without running the page: no computed style, no simulated input, no script in the template. */
function isStaticCheckSpec(spec: unknown): boolean {
  if (!isObject(spec) || spec.language !== 'html') return false;
  const checks = checksOf(spec);
  if (checks.length === 0 || !checks.every(isStaticCheck)) return false;
  return !JSON.stringify(spec.starter ?? '').toLowerCase().includes('<script');
}

export function gradingMode(kind: string, spec: unknown): GradeMode {
  if (PARTICIPATION_KINDS.has(kind)) return 'participation';
  if (CHOICE_KINDS.has(kind) || FILL_KINDS.has(kind)) return 'server';
  if (kind === 'code_editor_checks' && isStaticCheckSpec(spec)) return 'server';
  return 'self_reported';
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length || new Set(a).size !== a.length) return false;
  const expected = new Set(b);
  return a.every((item) => expected.has(item));
}

function gradeChoice(kind: string, spec: Json, answer: unknown): boolean | null {
  if (!isObject(answer)) return null;
  if (kind === 'single_choice') {
    if (!isStringArray(answer.option_ids)) return null;
    return typeof spec.correct_option_id === 'string' && answer.option_ids.length === 1 && answer.option_ids[0] === spec.correct_option_id;
  }
  if (kind === 'multi_choice') {
    if (!isStringArray(answer.option_ids)) return null;
    return isStringArray(spec.correct_option_ids) && spec.correct_option_ids.length > 0 && sameSet(answer.option_ids, spec.correct_option_ids);
  }
  if (kind === 'order') {
    if (!isStringArray(answer.order)) return null;
    const expected = spec.correct_order;
    return isStringArray(expected) && expected.length > 0 && answer.order.length === expected.length && answer.order.every((id, index) => id === expected[index]);
  }
  const made = answer.pairs;
  if (!Array.isArray(made) || !made.every((pair) => isStringArray(pair) && pair.length === 2)) return null;
  const pairs = Array.isArray(spec.pairs) ? spec.pairs.filter(isObject) : [];
  if (pairs.length === 0 || made.length !== pairs.length) return false;
  if (new Set(made.map(([left]) => left)).size !== made.length) return false;
  return made.every(([left, right]) => pairs.some((pair) => pair.left_id === left && pair.right_id === right));
}

const COMBINING_MARKS = /\p{Mn}/gu;
const EDGE_PUNCTUATION = /^\p{P}+|\p{P}+$/gu;

function normalizeLooseAnswer(raw: string): string {
  return raw.normalize('NFD').replace(COMBINING_MARKS, '').replace(/\s+/gu, ' ').trim().replace(EDGE_PUNCTUATION, '').trim().toLowerCase();
}

interface Blank {
  id: string;
  answer: string;
  loose: boolean;
  accepted: string[];
}

function blanksOf(spec: Json): Blank[] | null {
  if (!Array.isArray(spec.blanks) || spec.blanks.length === 0) return null;
  const blanks: Blank[] = [];
  for (const raw of spec.blanks) {
    if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.answer !== 'string') return null;
    const accept = isStringArray(raw.accept) ? raw.accept : [];
    blanks.push({ id: raw.id, answer: raw.answer, loose: raw.match === 'loose', accepted: [raw.answer, ...accept] });
  }
  return blanks;
}

/** Same rule as `packages/activities/src/code/guided/answerMatch.ts`. */
export function matchesBlank(blank: Pick<Blank, 'loose' | 'accepted'>, value: string): boolean {
  if (!blank.loose) {
    const typed = value.trim();
    return blank.accepted.some((candidate) => typed === candidate.trim());
  }
  const typed = normalizeLooseAnswer(value);
  if (!typed) return false;
  return blank.accepted.some((candidate) => {
    const expected = normalizeLooseAnswer(candidate);
    return expected.length > 0 && typed === expected;
  });
}

function substitute(starter: string, values: Map<string, string>): string {
  return starter.replace(BLANK_TOKEN, (token, id: string) => (values.has(id) ? (values.get(id) as string).trim() : token));
}

/**
 * The player sends the template with every hole filled. Two readings, either
 * one is enough: the source is the template filled with accepted answers, or
 * the text found in each hole grades as that hole's answer.
 */
function gradeFill(spec: Json, source: string): boolean | null {
  const blanks = blanksOf(spec);
  if (!blanks || typeof spec.starter !== 'string') return null;
  const starter = spec.starter;

  const combinations = blanks.reduce((total, blank) => total * blank.accepted.length, 1);
  if (combinations <= MAX_ANSWER_COMBINATIONS) {
    let candidates: Array<Map<string, string>> = [new Map()];
    for (const blank of blanks) {
      candidates = candidates.flatMap((values) => blank.accepted.map((answer) => new Map(values).set(blank.id, answer)));
    }
    if (candidates.some((values) => substitute(starter, values) === source)) return true;
  }

  // Linear on purpose: the source is the learner's, and a backtracking pattern over it would be theirs to slow down.
  const byId = new Map(blanks.map((blank) => [blank.id, blank]));
  const literals: string[] = [];
  const order: string[] = [];
  let cursor = 0;
  let literal = '';
  for (const match of starter.matchAll(BLANK_TOKEN)) {
    const index = match.index ?? 0;
    literal += starter.slice(cursor, index);
    if (byId.has(match[1])) {
      literals.push(literal);
      order.push(match[1]);
      literal = '';
    } else {
      literal += match[0];
    }
    cursor = index + match[0].length;
  }
  literals.push(literal + starter.slice(cursor));

  const last = literals.length - 1;
  if (!source.startsWith(literals[0]) || source.length < literals[0].length + literals[last].length) return false;
  const values = new Map<string, string>();
  let position = literals[0].length;
  for (let index = 0; index < order.length; index += 1) {
    const next = literals[index + 1];
    const end = index + 1 === last ? source.length - next.length : source.indexOf(next, position);
    if (end < position || !source.startsWith(next, end)) return false;
    if (!values.has(order[index])) values.set(order[index], source.slice(position, end));
    position = end + next.length;
  }
  return blanks.every((blank) => values.has(blank.id) && matchesBlank(blank, values.get(blank.id) as string));
}

interface SourceTag {
  name: string;
  kind: 'open' | 'close' | 'self';
}

const RAW_TEXT_TAGS = ['script', 'style', 'textarea', 'title'];
const VOID_TAGS = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];

/** Tags of the source as written, in order. Port of `sourceTags` in the player's check runtime. */
export function sourceTags(source: string): SourceTag[] {
  const lower = source.toLowerCase();
  const tokens: SourceTag[] = [];
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf('<', index);
    if (open === -1) break;
    if (source.slice(open, open + 4) === '<!--') {
      const end = source.indexOf('-->', open + 4);
      index = end === -1 ? source.length : end + 3;
      continue;
    }
    const next = source.charAt(open + 1);
    if (next === '!' || next === '?') {
      const end = source.indexOf('>', open);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    const match = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(source.slice(open, open + 64));
    if (!match) {
      index = open + 1;
      continue;
    }
    let end = open + match[0].length;
    let quote = '';
    while (end < source.length) {
      const char = source.charAt(end);
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === '>') {
        break;
      }
      end += 1;
    }
    const name = match[2].toLowerCase();
    const isClose = match[1] === '/';
    const selfClosing = !isClose && source.charAt(end - 1) === '/';
    tokens.push({ name, kind: isClose ? 'close' : selfClosing ? 'self' : 'open' });
    index = end + 1;
    if (!isClose && !selfClosing && RAW_TEXT_TAGS.includes(name)) {
      const endRaw = lower.indexOf(`</${name}`, index);
      index = endRaw === -1 ? source.length : endRaw;
    }
  }
  return tokens;
}

export function sourceCloses(source: string, selector: string): boolean {
  const names = selector.split(',').map((name) => name.trim().toLowerCase()).filter(Boolean);
  const all = names.includes('*');
  const stack: string[] = [];
  for (const tag of sourceTags(source)) {
    if (tag.kind === 'self' || VOID_TAGS.includes(tag.name)) continue;
    if (!all && !names.includes(tag.name)) continue;
    if (tag.kind === 'open') stack.push(tag.name);
    else if (stack.pop() !== tag.name) return false;
  }
  return stack.length === 0;
}

export function sourceHas(source: string, tag: string): boolean {
  const clean = source.replace(/<!-{2}[\s\S]*?(?:-{2}>|$)/g, '');
  if (tag === 'doctype') return /<!doctype\s+html\b/i.test(clean);
  return sourceTags(clean).some((token) => token.name === tag && token.kind !== 'close');
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/** One check against the parsed source. Port of `evaluate` in the player's check runtime, static asserts only. */
function evaluateCheck(check: Json, source: string, document: HtmlDocument): boolean {
  const assert = check.assert as Json;
  const selector = typeof check.selector === 'string' ? check.selector : '';
  if (assert.type === 'closes') return sourceCloses(source, selector);
  if (assert.type === 'source_has') return typeof assert.tag === 'string' && sourceHas(source, assert.tag);
  const count = document.count(selector);
  if (assert.type === 'count') return count === assert.equals;
  if (count === 0) return false;
  if (assert.type === 'exists') return true;
  const equals = optionalString(assert.equals);
  const contains = optionalString(assert.contains);
  if (assert.type === 'text') {
    const text = normalizeText(document.text(selector) ?? '');
    if (equals !== undefined && text !== normalizeText(equals)) return false;
    if (contains !== undefined && !text.includes(normalizeText(contains))) return false;
    return true;
  }
  if (assert.type === 'class') {
    const classes = document.attr(selector, 'class') ?? '';
    if (equals !== undefined) {
      const want = equals.split(/\s+/).filter(Boolean);
      const have = classes.split(/\s+/).filter(Boolean);
      return want.every((name) => have.includes(name)) && have.every((name) => want.includes(name));
    }
    return contains !== undefined && classes.includes(contains);
  }
  if (assert.type === 'attr') {
    const value = typeof assert.name === 'string' ? document.attr(selector, assert.name) : null;
    if (value === null) return false;
    if (equals !== undefined && value !== equals) return false;
    if (contains !== undefined && !value.includes(contains)) return false;
    return true;
  }
  return false;
}

function gradeChecks(spec: Json, source: string, parseHtml: HtmlParser): boolean {
  // The player grades the source with its own runner script appended; the tree here has the same extra element.
  const document = parseHtml(`${source}<script></script>`);
  return checksOf(spec).every((check) => {
    try {
      return evaluateCheck(check, source, document);
    } catch {
      return false;
    }
  });
}

/** Each static check against one HTML source, in order: the lesson engine's own asserts, run outside a lesson. */
export function staticCheckResults(checks: readonly unknown[], source: string, parseHtml: HtmlParser): boolean[] {
  const document = parseHtml(`${source}<script></script>`);
  return checks.map((check) => {
    try {
      return isObject(check) && isObject(check.assert) && isStaticCheck(check) && evaluateCheck(check, source, document);
    } catch {
      return false;
    }
  });
}

/**
 * The verdict for one submission. A learner who says they missed is recorded as
 * a miss. A claimed pass on a `server` activity stands only if the answer
 * grades as correct in one of the languages the spec is authored in.
 */
export function gradeSubmission(kind: string, spec: unknown, submission: Submission, claimedPassed: boolean, parseHtml: HtmlParser): Grade {
  const mode = gradingMode(kind, spec);
  if (mode !== 'server' || !claimedPassed) return { mode, passed: claimedPassed };

  const isCode = FILL_KINDS.has(kind) || kind === 'code_editor_checks';
  if (isCode && typeof submission.response !== 'string') return { mode, passed: false, reason: 'answer_required' };

  let judged = false;
  for (const locale of LOCALES) {
    const resolved = resolveSpec(spec, locale);
    if (!isObject(resolved)) continue;
    let verdict: boolean | null;
    if (CHOICE_KINDS.has(kind)) verdict = gradeChoice(kind, resolved, submission.answer);
    else if (FILL_KINDS.has(kind)) verdict = gradeFill(resolved, submission.response as string);
    else verdict = gradeChecks(resolved, submission.response as string, parseHtml);
    if (verdict === null) {
      if (CHOICE_KINDS.has(kind)) return { mode, passed: false, reason: 'answer_required' };
      continue;
    }
    judged = true;
    if (verdict) return { mode, passed: true };
  }
  return { mode, passed: false, reason: judged ? 'answer_rejected' : 'invalid_spec' };
}

export interface CheckResult {
  id: string;
  passed: boolean;
}

/**
 * Each check of a server-graded editor activity against the submitted source,
 * in the authored language that passes the most of them. `null` when the
 * activity is not one the server runs checks for.
 */
export function checkResults(kind: string, spec: unknown, source: string, parseHtml: HtmlParser): CheckResult[] | null {
  if (kind !== 'code_editor_checks' || gradingMode(kind, spec) !== 'server') return null;
  let best: CheckResult[] | null = null;
  for (const locale of LOCALES) {
    const resolved = resolveSpec(spec, locale);
    if (!isObject(resolved)) continue;
    const document = parseHtml(`${source}<script></script>`);
    const results = checksOf(resolved).map((check, index) => {
      let passed = false;
      try {
        passed = evaluateCheck(check, source, document);
      } catch {
        passed = false;
      }
      return { id: typeof check.id === 'string' ? check.id : String(index), passed };
    });
    const score = results.filter((result) => result.passed).length;
    if (!best || score > best.filter((result) => result.passed).length) best = results;
  }
  return best;
}

/**
 * Which holes of a fill activity hold an accepted answer, from the values the
 * player sent beside the source. `null` when there is nothing to read.
 */
export function blankVerdicts(kind: string, spec: unknown, values: unknown): Record<string, boolean> | null {
  if (!FILL_KINDS.has(kind) || !isObject(values)) return null;
  let best: Record<string, boolean> | null = null;
  for (const locale of LOCALES) {
    const resolved = resolveSpec(spec, locale);
    const blanks = isObject(resolved) ? blanksOf(resolved) : null;
    if (!blanks) continue;
    const verdicts = Object.fromEntries(blanks.map((blank) => [blank.id, typeof values[blank.id] === 'string' && matchesBlank(blank, values[blank.id] as string)]));
    const score = Object.values(verdicts).filter(Boolean).length;
    if (!best || score > Object.values(best).filter(Boolean).length) best = verdicts;
  }
  return best;
}

/** Deterministic JSON: object keys sorted at every level. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
