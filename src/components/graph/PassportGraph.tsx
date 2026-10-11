import { Link } from 'react-router-dom';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { useLearnerProfile } from '@/hooks/useLearnerProfile';
import { useI18n } from '@/i18n';
import { CapabilityGraphSection } from '@/components/graph/CapabilityGraphSection';
import { ANONYMOUS_WALLET, nextNode } from '@/components/graph/capabilityView';

/** /passport block: the "next to prove" card above the signed-in learner's graph (an all-open graph without a wallet). */
export function PassportGraph({ wallet }: { wallet: string | null }) {
  const { t, locale } = useI18n();
  const query = useLearnerProfile(wallet ?? ANONYMOUS_WALLET, locale);
  const capabilities = query.data?.status === 'ok' ? query.data.profile.capabilities : null;
  const next = capabilities ? nextNode(capabilities) : null;
  const trailTitle = next ? capabilities?.trails.find((x) => x.trail === next.trail)?.title ?? '' : '';

  if (query.isPending) return <TeraLoader size="md" label={t('graph.loading')} />;
  if (query.isError || !capabilities) {
    return (
      <div role="alert" className="rounded-[14px] border border-[#262320] bg-[#141210] p-4 [font:500_14px_Inter] text-[#C9BFB0]" data-testid="passport-graph-failed">
        {t('graph.failed')}
        <button type="button" onClick={() => void query.refetch()} className="mt-3 block h-11 rounded-lg border border-[#3FD17F] px-4 [font:700_13px_JetBrains_Mono] text-[#3FD17F]">
          {t('graph.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="passport-graph">
      {next ? (
        <div className="flex flex-col gap-1 rounded-[14px] border border-[#3FD17F] bg-[#141210] p-4 shadow-[0_0_32px_rgba(63,209,127,.18)] sm:p-5" data-testid="passport-next-card">
          <span className="[font:700_12px_JetBrains_Mono] uppercase tracking-[.1em] text-[#3FD17F]">{t('graph.nextCard')}</span>
          <span className="[font:700_30px/1.1_'Barlow_Condensed'] text-[#F4EDE2]">{next.title}</span>
          <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('graph.detail.trailDay', { trail: trailTitle, day: next.day })}</span>
        </div>
      ) : (
        <p className="rounded-[14px] border border-[#262320] bg-[#141210] p-4 [font:500_14px_Inter] text-[#C9BFB0]">{t('graph.allProven')}</p>
      )}
      {!wallet && <p className="[font:500_13px_Inter] text-[#A0978A]" data-testid="passport-graph-hint">{t('graph.noWallet')}</p>}
      <CapabilityGraphSection wallet={wallet ?? ANONYMOUS_WALLET} capabilities={capabilities} />
      {wallet && (
        <Link to={`/u/${wallet}`} className="inline-flex min-h-11 items-center self-start [font:700_13px_JetBrains_Mono] text-[#3FD17F] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]" data-testid="passport-profile-link">
          {t('profile.open')}
        </Link>
      )}
    </div>
  );
}
