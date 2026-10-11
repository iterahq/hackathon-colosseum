import * as Dialog from '@radix-ui/react-dialog';
import { useI18n } from '@/i18n';
import type { AssetRead } from '@/lib/chainClaims';
import type { Capabilities, CapabilityNode } from '@/types/learnerProfile';
import { EvidenceBlock } from '@/components/graph/EvidenceBlock';
import type { NodeView } from '@/components/graph/capabilityView';

const EXPLORER = 'https://explorer.solana.com/';
const safeUrl = (url: string | null): string | null => (url && url.startsWith(EXPLORER) ? url : null);
const LINK =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-[#3FD17F] px-4 [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:bg-[#3FD17F] hover:text-[#0A0908] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4EDE2]';
const LABEL = '[font:700_11px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]';
const PILL: Record<NodeView, string> = {
  chain: 'border-[#3FD17F] text-[#3FD17F]',
  server: 'border-[#2fa766] text-[#6fe6a3]',
  checking: 'border-[#2fa766] text-[#6fe6a3]',
  recorded: 'border-[#F2C66D] text-[#F2C66D]',
  unconfirmed: 'border-[#F2C66D] text-[#F2C66D]',
  open: 'border-[#3a352f] text-[#A0978A]',
};

interface Props {
  wallet: string;
  capabilities: Capabilities;
  node: CapabilityNode;
  views: Record<string, NodeView>;
  reads: Record<string, AssetRead> | null;
  onClose: () => void;
}

export function NodeDetail({ wallet, capabilities, node, views, reads, onClose }: Props) {
  const { t } = useI18n();
  const view = views[node.id] ?? 'open';
  const trailTitle = (trail: number) => capabilities.trails.find((x) => x.trail === trail)?.title ?? `#${trail + 1}`;
  const proof = node.proof;
  const read = proof ? reads?.[proof.asset] : undefined;
  const chainValue = proof && read?.status === 'ok' ? read.claims[proof.attribute] ?? null : null;
  const shownValue = chainValue ?? proof?.onchainValue ?? null;
  const tx = safeUrl(proof?.txExplorerUrl ?? null);
  const asset = safeUrl(proof?.assetExplorerUrl ?? null);
  const prerequisites = node.requires.map((id) => capabilities.nodes.find((n) => n.id === id)).filter((n): n is CapabilityNode => Boolean(n));

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="graph-detail"
          className="graph-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col gap-4 overflow-y-auto overflow-x-hidden rounded-t-2xl border border-[#262320] bg-[#141210] p-5 pb-8 text-[#F4EDE2] shadow-[0_-12px_48px_rgba(0,0,0,.6)] sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-2xl sm:pb-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={LABEL}>{t('graph.detail.trailDay', { trail: trailTitle(node.trail), day: node.day })}</p>
              <Dialog.Title className="mt-1.5 [font:700_28px/1.1_'Barlow_Condensed']">{node.title}</Dialog.Title>
            </div>
            <Dialog.Close className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#262320] text-[#C9BFB0] hover:text-[#F4EDE2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]" aria-label={t('graph.detail.close')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </Dialog.Close>
          </div>
          <p className={`inline-flex w-fit max-w-full rounded-full border px-3 py-1.5 [font:700_13px/1.3_Inter] ${PILL[view]}`} data-testid="graph-detail-status">
            {t(`graph.status.${view}`)}
          </p>

          {proof && (
            <dl className="flex flex-col gap-3">
              <div>
                <dt className={LABEL}>{t('graph.detail.attribute')}</dt>
                <dd className="mt-1 break-all [font:500_13px_JetBrains_Mono] text-[#F4EDE2]" data-testid="graph-attribute">{proof.attribute}</dd>
              </div>
              <div>
                <dt className={LABEL}>{t('graph.detail.value')}</dt>
                <dd className="mt-1 break-all [font:500_13px_JetBrains_Mono] text-[#F4EDE2]" data-testid="graph-value">{shownValue ?? t('graph.detail.notWritten')}</dd>
              </div>
              <div>
                <dt className={LABEL}>{t('graph.detail.hash')}</dt>
                <dd className="mt-1 break-all [font:500_12px/1.5_JetBrains_Mono] text-[#C9BFB0]" data-testid="graph-hash">{proof.evidenceHash}</dd>
              </div>
            </dl>
          )}

          {(tx || asset) && (
            <div className="flex flex-wrap gap-2">
              {tx && <a href={tx} target="_blank" rel="noopener noreferrer" className={LINK} data-testid="graph-tx-link">{t('graph.detail.viewTx')} ↗</a>}
              {asset && <a href={asset} target="_blank" rel="noopener noreferrer" className={LINK} data-testid="graph-asset-link">{t('graph.detail.viewAsset')} ↗</a>}
            </div>
          )}

          {proof && <EvidenceBlock wallet={wallet} claimId={node.id} proofHash={proof.evidenceHash} />}

          {node.status === 'open' && (
            <div className="flex flex-col gap-3" data-testid="graph-open-help">
              <p className="[font:500_15px/1.4_Inter] text-[#F4EDE2]">{t('graph.detail.prove', { day: node.day, trail: trailTitle(node.trail) })}</p>
              <div>
                <p className={LABEL}>{t('graph.detail.requires')}</p>
                {prerequisites.length === 0 ? (
                  <p className="mt-1 [font:500_13px_Inter] text-[#A0978A]">{t('graph.detail.noRequires')}</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {prerequisites.map((p) => {
                      const pv = views[p.id] ?? 'open';
                      return (
                        <li key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-[#262320] bg-[#0A0908] px-3 py-2.5" data-testid="graph-prereq">
                          <span className="[font:500_13px/1.35_Inter] text-[#F4EDE2]">{p.title}</span>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 [font:700_11px_JetBrains_Mono] ${PILL[pv]}`}>{t(`graph.status.${pv}`)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
