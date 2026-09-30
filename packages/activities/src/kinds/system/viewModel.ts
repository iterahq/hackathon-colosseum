import type { ViewBind, ViewNode } from '../../specs.js';

export function isBind(value: unknown): value is ViewBind {
  return !!value && typeof value === 'object' && typeof (value as ViewBind).bind === 'string';
}

function segments(path: string): string[] {
  return path.split('.').filter((s) => s.length > 0);
}

export function getPath(source: unknown, path: string): unknown {
  let cur: unknown = source;
  for (const key of segments(path)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function setPath<T>(source: T, path: string, value: unknown): T {
  const keys = segments(path);
  if (keys.length === 0) return value as T;
  const [head, ...rest] = keys;
  const base: unknown = source ?? (/^\d+$/.test(head) ? [] : {});
  const child = (base as Record<string, unknown>)[head];
  const next = rest.length === 0 ? value : setPath(child, rest.join('.'), value);
  if (Array.isArray(base)) {
    const copy = [...base];
    copy[Number(head)] = next;
    return copy as T;
  }
  return { ...(base as Record<string, unknown>), [head]: next } as T;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function renderId(id: string, index: number | undefined): string {
  return index === undefined ? id : `${id}#${index}`;
}

export function baseId(ref: string): string {
  const hash = ref.lastIndexOf('#');
  return hash === -1 ? ref : ref.slice(0, hash);
}

export function isLeaf(node: ViewNode): boolean {
  return node.type !== 'box' && node.type !== 'list';
}

/** Every rendered leaf id, in document order, with list items expanded against `state`. */
export function renderedLeafIds(view: ViewNode, state: unknown): string[] {
  const out: string[] = [];
  const walk = (node: ViewNode, scope: unknown, index: number | undefined) => {
    if (node.type === 'box') node.children.forEach((c) => walk(c, scope, index));
    else if (node.type === 'list') {
      const items = getPath(scope, node.bind);
      if (Array.isArray(items)) items.forEach((item, i) => walk(node.item, item, i));
    } else out.push(renderId(node.id, index));
  };
  walk(view, state, undefined);
  return out;
}

/** Every rendered node id (containers included), in document order. */
export function renderedNodeIds(view: ViewNode, state: unknown): string[] {
  const out: string[] = [];
  const walk = (node: ViewNode, scope: unknown, index: number | undefined) => {
    out.push(renderId(node.id, index));
    if (node.type === 'box') node.children.forEach((c) => walk(c, scope, index));
    if (node.type === 'list') {
      const items = getPath(scope, node.bind);
      if (Array.isArray(items)) items.forEach((item, i) => walk(node.item, item, i));
    }
  };
  walk(view, state, undefined);
  return out;
}

/** Expand a reference to rendered ids: `item#0` is itself, a bare `item` inside a list is every instance. */
export function expandRef(ref: string, rendered: readonly string[]): string[] {
  if (rendered.includes(ref)) return [ref];
  return rendered.filter((id) => baseId(id) === ref);
}
