import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { BountyShell } from '@/components/bounty/bountyUi';
import { DurableSection } from '@/components/verify/DurableSection';
import { EvidenceSection } from '@/components/verify/EvidenceSection';
import { GateSection } from '@/components/verify/GateSection';
import { ProgramSection } from '@/components/verify/ProgramSection';
import { RpcSection } from '@/components/verify/RpcSection';
import { SoulboundSection } from '@/components/verify/SoulboundSection';
import { SourceSection } from '@/components/verify/SourceSection';
import { TrustSection } from '@/components/verify/TrustSection';
import { FOCUS } from '@/components/shop/shopStyles';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';

const SECTIONS = ['program', 'source', 'evidence', 'soulbound', 'gate', 'rpc', 'durable', 'trust'] as const;

/** /verify: every on-chain claim Itera makes, with the steps to check it without trusting Itera. Public. */
export default function VerifyPage() {
  const { t } = useI18n();
  const { hash } = useLocation();
  usePageTitle(t('verify.pageTitle'));

  useEffect(() => {
    const id = hash.replace('#', '');
    if (id) document.getElementById(id)?.scrollIntoView?.();
  }, [hash]);

  return (
    <BountyShell>
      <header className="flex flex-col gap-3" data-testid="verify-page">
        <h1 className="[font:700_44px/1.02_'Barlow_Condensed'] max-sm:text-[34px]">{t('verify.pageTitle')}</h1>
        <p className="max-w-[640px] [font:400_15px/1.6_Inter] text-[#C9BFB0]">{t('verify.intro')}</p>
        <nav aria-label={t('verify.nav')} className="flex flex-wrap gap-2">
          {SECTIONS.map((id) => (
            <a key={id} href={`#${id}`} className={`inline-flex min-h-11 items-center rounded-full border border-[#2E2A25] px-3.5 [font:600_12px_JetBrains_Mono] text-[#F4EDE2] hover:border-[#3FD17F] ${FOCUS}`}>
              {t(`verify.nav.${id}`)}
            </a>
          ))}
        </nav>
      </header>
      <ProgramSection />
      <SourceSection />
      <EvidenceSection />
      <SoulboundSection />
      <GateSection />
      <RpcSection />
      <DurableSection />
      <TrustSection />
    </BountyShell>
  );
}
