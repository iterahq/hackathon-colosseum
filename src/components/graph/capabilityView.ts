import { checkClaim, type AssetRead, type ChainTarget } from '@/lib/chainClaims';
import type { Capabilities, CapabilityNode } from '@/types/learnerProfile';

export type NodeView = 'chain' | 'checking' | 'server' | 'unconfirmed' | 'recorded' | 'open';
export type ChainState = { phase: 'pending' } | { phase: 'error' } | { phase: 'done'; reads: Record<string, AssetRead> };

export const isLit = (view: NodeView): boolean => view === 'chain' || view === 'checking' || view === 'server';

export function nodeView(node: CapabilityNode, chain: ChainState): NodeView {
  if (node.status === 'open') return 'open';
  if (node.status === 'recorded') return 'recorded';
  if (chain.phase === 'pending') return 'checking';
  if (chain.phase === 'error') return 'server';
  if (!node.proof) return 'unconfirmed';
  return checkClaim(chain.reads[node.proof.asset], node.proof.attribute, node.proof.evidenceHash) === 'verified' ? 'chain' : 'unconfirmed';
}

export function viewsOf(capabilities: Capabilities, chain: ChainState): Record<string, NodeView> {
  return Object.fromEntries(capabilities.nodes.map((n) => [n.id, nodeView(n, chain)]));
}

/** One entry per asset holding a server-verified claim, listing the attributes to look for on it. */
export function chainTargets(capabilities: Capabilities | null): ChainTarget[] {
  const byAsset = new Map<string, Set<string>>();
  for (const n of capabilities?.nodes ?? []) {
    if (n.status !== 'verified' || !n.proof) continue;
    byAsset.set(n.proof.asset, (byAsset.get(n.proof.asset) ?? new Set()).add(n.proof.attribute));
  }
  return [...byAsset].map(([asset, attributes]) => ({ asset, attributes: [...attributes] }));
}

export interface Progress {
  proven: number;
  total: number;
}

export function provenCount(views: Record<string, NodeView>, chain: ChainState): number {
  const all = Object.values(views);
  return chain.phase === 'done' ? all.filter((v) => v === 'chain').length : all.filter(isLit).length;
}

export function trailProgress(capabilities: Capabilities, views: Record<string, NodeView>): Record<number, Progress> {
  const out: Record<number, Progress> = {};
  for (const n of capabilities.nodes) {
    const p = (out[n.trail] ??= { proven: 0, total: 0 });
    p.total += 1;
    if (isLit(views[n.id]) || views[n.id] === 'chain') p.proven += 1;
  }
  return out;
}

export function nextNode(capabilities: Capabilities): CapabilityNode | null {
  return capabilities.nodes.find((n) => n.id === capabilities.next) ?? null;
}
