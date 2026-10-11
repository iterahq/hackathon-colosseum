/**
 * What the server can check of an activity the browser grades. These kinds
 * react to each gesture, so the browser holds everything it needs; a claimed
 * pass is accepted only with the trace of the gestures, and the trace must end
 * where the activity's own spec says a learner ends. It is a consistency check
 * of a self-reported result, not a grade.
 */
import { resolveSpec, sourceCloses, sourceHas, type HtmlParser } from './grading.ts';

type Json = Record<string, unknown>;

export type TraceReason = 'trace_required' | 'trace_rejected';

export interface TraceAction {
  type: string;
  at: number;
  payload?: Json;
}

export const MAX_TRACE_ACTIONS = 500;

const SCENE_KINDS = new Set(['xray', 'inspect', 'spot', 'timeline', 'selector', 'arrange', 'press', 'dial', 'wire', 'intercept', 'bucket', 'plug']);

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const objects = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : []);
const idsOf = (value: unknown): string[] => objects(value).map((item) => item.id).filter((id): id is string => typeof id === 'string');

/** The actions as the player recorded them; `null` when the value is not a trace. */
export function readTrace(value: unknown): TraceAction[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TRACE_ACTIONS) return null;
  const actions: TraceAction[] = [];
  for (const raw of value) {
    if (!isObject(raw) || typeof raw.type !== 'string' || typeof raw.at !== 'number' || !Number.isFinite(raw.at)) return null;
    actions.push({ type: raw.type, at: raw.at, ...(isObject(raw.payload) ? { payload: raw.payload } : {}) });
  }
  return actions;
}

function payloads(trace: readonly TraceAction[], type: string): Json[] {
  return trace.filter((action) => action.type === type).map((action) => action.payload ?? {});
}

function sameList(a: unknown, b: unknown): boolean {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => item === b[index]);
}

function sceneEndsRight(kind: string, spec: Json, trace: readonly TraceAction[]): boolean {
  const gate = trace[trace.length - 1].payload ?? {};
  const found = new Set(payloads(trace, 'element_found').map((payload) => payload.element_id));
  if (kind === 'xray') return typeof gate.coverage_goal === 'number';
  if (kind === 'inspect') {
    const elements = idsOf(isObject(spec.page) ? spec.page.elements : null);
    return elements.length > 0 && elements.every((id) => found.has(id));
  }
  if (kind === 'spot') {
    const bugs = idsOf(spec.bugs);
    return bugs.length > 0 && bugs.every((id) => found.has(id));
  }
  if (kind === 'timeline') {
    const steps = Array.isArray(spec.steps) ? spec.steps.length : 0;
    const visited = new Set(payloads(trace, 'step_visited').map((payload) => payload.index));
    return steps > 0 && visited.size >= steps - 1;
  }
  if (kind === 'selector') return payloads(trace, 'option_picked').length > 0 && typeof gate.option === 'string';
  if (kind === 'arrange') return sameList(gate.order, spec.correct) && payloads(trace, 'order_changed').length > 0;
  if (kind === 'press') return payloads(trace, 'pressed').length >= (typeof spec.goal === 'number' ? spec.goal : 1);
  if (kind === 'dial') {
    const [low, high] = Array.isArray(spec.target) ? spec.target : [spec.target, spec.target];
    return typeof gate.value === 'number' && typeof low === 'number' && typeof high === 'number' && gate.value >= low && gate.value <= high;
  }
  if (kind === 'wire') {
    const made = payloads(trace, 'wire_connected');
    const pairs = objects(spec.pairs);
    return pairs.length > 0 && pairs.every((pair) => made.some((wire) => wire.left_id === pair.left_id && wire.right_id === pair.right_id));
  }
  if (kind === 'intercept') return typeof spec.answer === 'string' && gate.node_id === spec.answer;
  if (kind === 'bucket') {
    const placed = payloads(trace, 'chip_placed');
    const chips = objects(spec.chips);
    return chips.length > 0 && chips.every((chip) => placed.some((drop) => drop.chip_id === chip.id && drop.bucket_id === chip.bucket));
  }
  const toggles = payloads(trace, 'cable_toggled').map((payload) => payload.connected);
  return toggles.includes(false) && toggles[toggles.length - 1] === true;
}

function checkScene(kind: string, spec: unknown, traceValue: unknown): TraceReason | null {
  const trace = readTrace(traceValue);
  if (!trace) return 'trace_required';
  if (trace[trace.length - 1].type !== 'gate_opened') return 'trace_rejected';
  return isObject(spec) && sceneEndsRight(kind, spec, trace) ? null : 'trace_rejected';
}

const STATIC_ASSERTS = new Set(['count', 'exists', 'closes', 'source_has']);

/**
 * An editor activity whose checks need a real browser (computed style, a
 * simulated click): the source must exist, differ from what the learner was
 * handed, and pass the checks that read only the markup.
 */
function checkBrowserEditor(spec: unknown, response: string | null, parseHtml: HtmlParser): TraceReason | null {
  if (typeof response !== 'string' || !response.trim()) return 'trace_required';
  const versions = (['pt', 'en'] as const).map((locale) => resolveSpec(spec, locale)).filter(isObject);
  if (versions.some((resolved) => typeof resolved.starter === 'string' && resolved.starter.trim() === response.trim())) return 'trace_rejected';
  for (const resolved of versions) {
    if (resolved.language !== 'html') return null;
    const document = parseHtml(`${response}<script></script>`);
    const markupOnly = objects(resolved.checks).filter((check) => {
      const steps = check.steps;
      return (!Array.isArray(steps) || steps.length === 0) && isObject(check.assert) && STATIC_ASSERTS.has(String(check.assert.type));
    });
    const passes = markupOnly.every((check) => {
      const assert = check.assert as Json;
      const selector = typeof check.selector === 'string' ? check.selector : '';
      try {
        if (assert.type === 'closes') return sourceCloses(response, selector);
        if (assert.type === 'source_has') return typeof assert.tag === 'string' && sourceHas(response, assert.tag);
        const count = document.count(selector);
        return assert.type === 'count' ? count === assert.equals : count > 0;
      } catch {
        return false;
      }
    });
    if (passes) return null;
  }
  return 'trace_rejected';
}

/** Which self-reported kinds the server reads a trace or a source for. The rest are recorded as claimed. */
export function isTraceChecked(kind: string): boolean {
  return SCENE_KINDS.has(kind) || kind === 'code_editor_checks';
}

/** Why a claimed pass of a self-reported activity is refused; `null` when it stands. */
export function checkSelfReported(kind: string, spec: unknown, submission: { response: string | null; trace: unknown }, parseHtml: HtmlParser): TraceReason | null {
  if (SCENE_KINDS.has(kind)) return checkScene(kind, spec, submission.trace);
  if (kind === 'code_editor_checks') return checkBrowserEditor(spec, submission.response, parseHtml);
  return null;
}
