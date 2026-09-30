import type { ComposeBlockSpec, ComposeTargetNode, ViewNode } from '../../specs.js';

export interface PlacedNode {
  uid: string;
  block: string;
  children: PlacedNode[];
}

function signature(node: { block: string; children?: readonly { block: string; children?: unknown }[] }, ordered: boolean): string {
  const kids = (node.children ?? []).map((c) => signature(c as ComposeTargetNode, ordered));
  if (!ordered) kids.sort();
  return `${node.block}(${kids.join(',')})`;
}

export function treeMatches(placed: PlacedNode, target: ComposeTargetNode, ordered: boolean): boolean {
  return signature(placed, ordered) === signature(target, ordered);
}

/** Every `parent>child` block pair the target contains, with the most times it repeats under one parent. */
export function allowedPairs(target: ComposeTargetNode): Map<string, number> {
  const pairs = new Map<string, number>();
  const walk = (node: ComposeTargetNode) => {
    const counts = new Map<string, number>();
    for (const child of node.children ?? []) counts.set(child.block, (counts.get(child.block) ?? 0) + 1);
    for (const [block, count] of counts) {
      const key = `${node.block}>${block}`;
      pairs.set(key, Math.max(pairs.get(key) ?? 0, count));
    }
    (node.children ?? []).forEach(walk);
  };
  walk(target);
  return pairs;
}

export function countBlock(node: PlacedNode, block: string): number {
  return node.children.reduce((sum, child) => sum + (child.block === block ? 1 : 0) + countBlock(child, block), 0);
}

export function findNode(node: PlacedNode, uid: string): PlacedNode | undefined {
  if (node.uid === uid) return node;
  for (const child of node.children) {
    const hit = findNode(child, uid);
    if (hit) return hit;
  }
  return undefined;
}

export function insertChild(node: PlacedNode, parentUid: string, child: PlacedNode): PlacedNode {
  if (node.uid === parentUid) return { ...node, children: [...node.children, child] };
  return { ...node, children: node.children.map((c) => insertChild(c, parentUid, child)) };
}

export function removeNode(node: PlacedNode, uid: string): PlacedNode {
  return { ...node, children: node.children.filter((c) => c.uid !== uid).map((c) => removeNode(c, uid)) };
}

export function targetAsPlaced(target: ComposeTargetNode, uid = 'root'): PlacedNode {
  return {
    uid,
    block: target.block,
    children: (target.children ?? []).map((child, i) => targetAsPlaced(child, `${uid}.${i}`)),
  };
}

function prefixIds(view: ViewNode, prefix: string): ViewNode {
  const id = `${prefix}${view.id}`;
  if (view.type === 'box') return { ...view, id, children: view.children.map((c) => prefixIds(c, prefix)) };
  if (view.type === 'list') return { ...view, id, item: prefixIds(view.item, prefix) };
  return { ...view, id };
}

export function acceptsChildren(block: ComposeBlockSpec | undefined): boolean {
  return block?.view.type === 'box';
}

/** The preview: each placed block's own view, with its placed children nested inside when it is a box. */
export function composeView(node: PlacedNode, blocks: ReadonlyMap<string, ComposeBlockSpec>): ViewNode | null {
  const block = blocks.get(node.block);
  if (!block) return null;
  const own = prefixIds(block.view, `${node.uid}__`);
  if (own.type !== 'box') return own;
  const nested = node.children.map((child) => composeView(child, blocks)).filter((v): v is ViewNode => !!v);
  return { ...own, children: [...own.children, ...nested] };
}
