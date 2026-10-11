import { useEffect, useState } from 'react';
import { useClaimEvidence } from '@/hooks/useLearnerProfile';
import { useI18n } from '@/i18n';
import { evidenceFacts, sha256Hex } from '@/lib/chainClaims';
import { formatDate } from '@/components/graph/formatDate';

type Check = 'pending' | 'ok' | 'bad';

export function EvidenceBlock({ wallet, claimId, proofHash }: { wallet: string; claimId: string; proofHash: string }) {
  const { t, locale } = useI18n();
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

  const facts = evidence ? evidenceFacts(evidence.evidence) : null;

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#262320] bg-[#0A0908] p-3.5" aria-label={t('graph.detail.evidence')} data-testid="graph-evidence">
      <h3 className="[font:700_12px_JetBrains_Mono] uppercase tracking-[.08em] text-[#A0978A]">{t('graph.detail.evidence')}</h3>
      {query.isPending && <p className="[font:500_13px_Inter] text-[#A0978A]">{t('graph.detail.evidenceLoading')}</p>}
      {query.isError && (
        <p role="alert" className="[font:500_13px_Inter] text-[#F2C66D]">
          {t('graph.detail.evidenceFailed')}{' '}
          <button type="button" onClick={() => void query.refetch()} className="inline-flex min-h-11 items-center underline">
            {t('graph.retry')}
          </button>
        </p>
      )}
      {evidence && check === 'ok' && <p className="[font:700_13px/1.4_JetBrains_Mono] text-[#3FD17F]" data-testid="graph-hash-ok">{t('graph.detail.hashOk')}</p>}
      {evidence && check === 'bad' && <p role="alert" className="[font:700_13px/1.4_Inter] text-[#F2C66D]" data-testid="graph-hash-bad">{t('graph.detail.hashBad')}</p>}
      {facts && (
        <p className="[font:500_13px_Inter] text-[#C9BFB0]">
          {t('graph.detail.activities', { n: facts.activityCount, date: formatDate(facts.completedAt, locale) })}
        </p>
      )}
      {facts && (
        <p className={`[font:500_13px/1.4_Inter] ${facts.serverVerified ? 'text-[#F4EDE2]' : 'text-[#A0978A]'}`} data-testid="graph-evidence-graded" data-version={facts.version}>
          {facts.serverVerified ? t('graph.detail.graded', { share: facts.serverVerified, n: facts.answerHashes }) : t('graph.detail.ungraded')}
        </p>
      )}
    </section>
  );
}
