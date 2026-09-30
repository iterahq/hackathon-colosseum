import { SYSTEM_KINDS, type SystemKind } from './specs.js';

type Parse = { success: true; data: unknown } | { success: false; error: string };
type Raw = Record<string, unknown>;

const VIEW_TYPES = new Set(['box', 'heading', 'text', 'input', 'button', 'checkbox_item', 'list']);

export function isSystemKind(kind: unknown): kind is SystemKind {
  return typeof kind === 'string' && (SYSTEM_KINDS as readonly string[]).includes(kind);
}

function asRaw(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null;
}

function isText(value: unknown): boolean {
  if (typeof value === 'string') return true;
  const raw = asRaw(value);
  return !!raw && (typeof raw.pt === 'string' || typeof raw.en === 'string');
}

function viewProblem(value: unknown, seen: Set<string>): string | null {
  const node = asRaw(value);
  if (!node) return 'view node is not an object';
  if (typeof node.id !== 'string' || node.id.length === 0) return 'view node needs an id';
  if (!VIEW_TYPES.has(String(node.type))) return `view node "${node.id}" has an unknown type`;
  if (seen.has(node.id)) return `duplicate view node id "${node.id}"`;
  seen.add(node.id);
  if (node.type === 'box') {
    if (!Array.isArray(node.children)) return `box "${node.id}" needs children`;
    for (const child of node.children) {
      const why = viewProblem(child, seen);
      if (why) return why;
    }
  }
  if (node.type === 'list') {
    if (typeof node.bind !== 'string') return `list "${node.id}" needs bind`;
    return viewProblem(node.item, seen);
  }
  return null;
}

function envelopeProblem(raw: Raw): string | null {
  for (const key of ['prompt', 'reaction', 'stamp']) {
    if (!isText(raw[key])) return `${key} is required`;
  }
  return null;
}

function check(kind: SystemKind, problems: (raw: Raw) => string | null): (spec: unknown) => Parse {
  return (spec) => {
    const raw = asRaw(spec);
    if (!raw) return { success: false, error: `${kind}: spec is not an object` };
    const why = envelopeProblem(raw) ?? problems(raw);
    return why ? { success: false, error: `${kind}: ${why}` } : { success: true, data: spec };
  };
}

function nonEmptyList(value: unknown): Raw[] | null {
  return Array.isArray(value) && value.length > 0 && value.every((v) => asRaw(v)) ? (value as Raw[]) : null;
}

export const SYSTEM_KINDS_FALLBACK: Record<SystemKind, (spec: unknown) => Parse> = {
  decompose_canvas: check('decompose_canvas', (raw) => {
    const view = viewProblem(raw.view, new Set());
    if (view) return view;
    const parts = nonEmptyList(raw.parts);
    if (!parts || parts.length < 2) return 'at least 2 parts are required';
    const groups = Array.isArray(raw.must_group) ? raw.must_group.length : 0;
    const separations = Array.isArray(raw.must_separate) ? raw.must_separate.length : 0;
    if (groups + separations === 0) return 'at least one must_group or must_separate constraint is required';
    return null;
  }),
  compose_blocks: check('compose_blocks', (raw) => {
    const blocks = nonEmptyList(raw.blocks);
    if (!blocks || blocks.length < 2) return 'at least 2 blocks are required';
    for (const block of blocks) {
      const view = viewProblem(block.view, new Set());
      if (view) return view;
    }
    const ids = new Set(blocks.map((b) => b.id));
    if (!ids.has(raw.root)) return 'root must reference one of blocks[].id';
    if (asRaw(raw.target)?.block !== raw.root) return 'target.block must equal root';
    return null;
  }),
  state_lab: check('state_lab', (raw) => {
    if (!asRaw(raw.state)) return 'state is required';
    const view = viewProblem(raw.view, new Set());
    if (view) return view;
    if (!nonEmptyList(raw.controls)) return 'at least 1 control is required';
    if (!nonEmptyList(raw.goals)) return 'at least 1 goal is required';
    return null;
  }),
  event_trace: check('event_trace', (raw) => {
    if (!asRaw(raw.state)) return 'state is required';
    const view = viewProblem(raw.view, new Set());
    if (view) return view;
    if (typeof asRaw(raw.trigger)?.node !== 'string') return 'trigger.node is required';
    const steps = nonEmptyList(raw.steps);
    if (!steps || steps.length < 2) return 'at least 2 steps are required';
    return null;
  }),
};
