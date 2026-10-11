import { useCallback, useMemo, useState } from 'react';
import { useChainClaims } from '@/hooks/useChainClaims';
import { useI18n } from '@/i18n';
import { shortAddress } from '@/lib/explorer';
import type { Capabilities } from '@/types/learnerProfile';
import { CapabilityGraph } from '@/components/graph/CapabilityGraph';
import { GraphHeader } from '@/components/graph/GraphHeader';
import { NodeDetail } from '@/components/graph/NodeDetail';
import { ANONYMOUS_WALLET, chainTargets, provenCount, trailProgress, viewsOf, type ChainState } from '@/components/graph/capabilityView';

const H2 = "[font:700_28px_'Barlow_Condensed']";

/** The capability map of one wallet: header, graph, and the detail panel. Re-reads the chain itself in the browser. */
export function CapabilityGraphSection({ wallet, capabilities }: { wallet: string; capabilities: Capabilities }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const targets = useMemo(() => chainTargets(capabilities), [capabilities]);
  const query = useChainClaims(wallet, targets);

  const chain: ChainState = useMemo(() => {
    if (targets.length === 0) return { phase: 'done', reads: {} };
    if (query.isSuccess) return { phase: 'done', reads: query.data };
    if (query.isError && !query.isFetching) return { phase: 'error' };
    return { phase: 'pending' };
  }, [targets.length, query.isSuccess, query.isError, query.isFetching, query.data]);

  const views = useMemo(() => viewsOf(capabilities, chain), [capabilities, chain]);
  const progress = useMemo(() => trailProgress(capabilities, views), [capabilities, views]);
  const proven = provenCount(views, chain);
  const node = capabilities.nodes.find((n) => n.id === selected) ?? null;
  const retry = useCallback(() => void query.refetch(), [query]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="graph-heading" data-testid="capability-section">
      <h2 id="graph-heading" className={H2}>{t('graph.title')}</h2>
      <GraphHeader capabilities={capabilities} chain={chain} proven={proven} progress={progress} hasRecorded={capabilities.nodes.some((n) => n.status === 'recorded')} onRetry={retry} />
      <div className="rounded-[14px] border border-[#262320] bg-[radial-gradient(ellipse_at_50%_0%,#16221b_0%,#141210_55%)] p-2 pb-4 sm:p-4">
        <CapabilityGraph capabilities={capabilities} views={views} progress={progress} label={wallet === ANONYMOUS_WALLET ? t('graph.title') : t('graph.mapLabel', { wallet: shortAddress(wallet) })} onSelect={setSelected} />
      </div>
      {node && (
        <NodeDetail wallet={wallet} capabilities={capabilities} node={node} views={views} reads={chain.phase === 'done' ? chain.reads : null} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}
