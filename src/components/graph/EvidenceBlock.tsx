import { useEffect, useState } from 'react';
import { useClaimEvidence } from '@/hooks/useLearnerProfile';
import { useI18n } from '@/i18n';
import { evidenceFacts, sha256Hex, type EvidenceFacts } from '@/lib/chainClaims';
import { TierBar, TierMedal } from '@/components/graph/TierMedal';
import { TIER_COLOR, evidenceShare, parseShare, tierOf, type EvidenceShare, type EvidenceTier } from '@/components/graph/evidenceTier';

type Check = 'pending' | 'ok' | 'bad';

export interface EvidenceCheck {
  loading: boolean;
  failed: boolean;
  retry: () => void;
  check: Check;
  facts: EvidenceFacts | null;
  /** The share of the document itself, once its hash matched in this browser. */
  share: EvidenceShare | null;
}

/** Fetches the evidence document of a claim and recomputes its hash here. Nothing of it is trusted before `check` is `ok`. */
export function useEvidenceCheck(wallet: string, claimId: string | null, proofHash: string): EvidenceCheck {
  const query = useClaimEvidence(wallet, claimId);
  const [check, setCheck] = useState<Check>('pending');
  const evidence = query.data;

  useEffect(() => {
    let live = true;
    setCheck('pending');
    if (!evidence) return;
    sha256Hex(evidence.evidence)
      .then((hash) => live && setCheck(hash === evidence.evidenceHash && hash === proofHash.toLowerCase() ? 'ok' : 'bad'))
      .catch(() => live && setCheck('bad'));
    return () => {
      live = false;
    };
  }, [evidence, proofHash]);

  return {
    loading: query.isPending,
    failed: query.isError,
    retry: () => void query.refetch(),
    check,
    facts: evidence ? evidenceFacts(evidence.evidence) : null,
    share: evidence && check === 'ok' ? evidenceShare(evidence.evidence) : null,
  };
}

/**
 * Who checked the answers behind this proof, as a medal and a bar. The strong reading comes from the document whose
 * hash this browser just recomputed; until then the card shows the share the profile answer carried, dimmed.
 */
export function EvidenceBlock({ evidence, listed }: { evidence: EvidenceCheck; listed: string | null | undefined }) {
  const { t } = useI18n();
  const strong = evidence.check === 'ok';
  const share = strong ? evidence.share : parseShare(listed);
  const tier: EvidenceTier | null = evidence.check === 'bad' ? null : strong || listed !== undefined ? tierOf(share) : null;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[#262320] bg-[#0A0908] p-3.5" aria-label={t('graph.detail.evidence')} data-testid="graph-evidence" data-tier={tier ?? undefined} data-strong={strong}>
      {tier && (
        <div className={`flex items-center gap-3.5 ${strong ? '' : 'opacity-60'}`}>
          <TierMedal key={`${tier}-${strong}`} tier={tier} size="lg" animate={strong} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="[font:700_24px/1_'Barlow_Condensed'] tracking-[.01em]" style={{ color: TIER_COLOR[tier] }} data-testid="graph-tier-label">{t(`graph.tier.${tier}`)}</p>
            {share && share.total > 0 ? (
              <p data-testid="graph-evidence-graded" data-version={evidence.facts?.version ?? 2}><TierBar share={share} tier={tier} /></p>
            ) : (
              evidence.facts && (
                <p className="w-fit rounded-full border border-[#262320] px-2 py-0.5 [font:500_11px/1.3_JetBrains_Mono] text-[#A0978A]" data-testid="graph-evidence-graded" data-version={evidence.facts.version}>
                  {t('graph.tier.v1')}
                </p>
              )
            )}
          </div>
        </div>
      )}
      {!tier && evidence.loading && <div className="h-16 animate-pulse rounded-lg bg-[#141210]" />}
      {evidence.loading && tier && <p className="[font:500_12px_JetBrains_Mono] text-[#A0978A]">{t('graph.detail.evidenceLoading')}</p>}
      {evidence.failed && (
        <p role="alert" className="flex items-center justify-between gap-3 [font:500_12px_JetBrains_Mono] text-[#F2C66D]">
          {t('graph.detail.evidenceFailed')}
          <button type="button" onClick={evidence.retry} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[#3a352f] px-3 text-[#F4EDE2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
            {t('graph.retry')}
          </button>
        </p>
      )}
      {strong && <p className="[font:700_12px/1.3_JetBrains_Mono] text-[#3FD17F]" data-testid="graph-hash-ok">{t('graph.detail.hashOk')}</p>}
      {evidence.check === 'bad' && <p role="alert" className="[font:700_13px/1.4_Inter] text-[#F2C66D]" data-testid="graph-hash-bad">{t('graph.detail.hashBad')}</p>}
    </section>
  );
}
