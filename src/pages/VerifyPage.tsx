import { Cpu, FileCode2, Hash, Hourglass, ShieldCheck, Snowflake, Stamp, Terminal, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { BountyShell } from '@/components/bounty/bountyUi';
import { DurableSection } from '@/components/verify/DurableSection';
import { EvidenceSection } from '@/components/verify/EvidenceSection';
import { GateSection } from '@/components/verify/GateSection';
import { ProgramSection } from '@/components/verify/ProgramSection';
import { RpcSection } from '@/components/verify/RpcSection';
import { SoulboundSection } from '@/components/verify/SoulboundSection';
import { SourceSection } from '@/components/verify/SourceSection';
import { StampSection } from '@/components/verify/StampSection';
import { SummaryCard } from '@/components/verify/SummaryCard';
import { TrustSection } from '@/components/verify/TrustSection';
import { DEVNET_BADGE, MONO_LABEL } from '@/components/shop/shopStyles';
import { VerifySectionChrome, type SectionTone } from '@/components/verify/VerifyParts';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useI18n } from '@/i18n';

const CHROME: Record<string, { icon: ReactNode; tone?: SectionTone }> = {
  program: { icon: <Cpu className="h-5 w-5" /> },
  source: { icon: <FileCode2 className="h-5 w-5" /> },
  evidence: { icon: <Hash className="h-5 w-5" /> },
  stamp: { icon: <Stamp className="h-5 w-5" /> },
  soulbound: { icon: <Snowflake className="h-5 w-5" /> },
  gate: { icon: <ShieldCheck className="h-5 w-5" /> },
  rpc: { icon: <Terminal className="h-5 w-5" /> },
  durable: { icon: <Hourglass className="h-5 w-5" /> },
  trust: { icon: <TriangleAlert className="h-5 w-5" />, tone: 'gold' },
};

const GROUP = 'flex flex-col gap-2';

/** /verify: every on-chain claim Itera makes, with the steps to check it without trusting Itera. Public. */
export default function VerifyPage() {
  const { t } = useI18n();
  const { hash } = useLocation();
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  usePageTitle(t('verify.pageTitle'));

  useEffect(() => {
    const id = hash.replace('#', '');
    if (id) document.getElementById(id)?.scrollIntoView?.();
  }, [hash]);

  const chrome = useMemo(
    () => ({
      sections: CHROME,
      onOpen: (id: string) => setOpened((current) => (current.has(id) ? current : new Set(current).add(id))),
    }),
    []
  );

  return (
    <BountyShell>
      <header className="flex flex-col gap-2" data-testid="verify-page">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="[font:700_44px/1.02_'Barlow_Condensed'] max-sm:text-[34px]">{t('verify.pageTitle')}</h1>
          <span className={DEVNET_BADGE}>{t('bounty.devnet')}</span>
        </div>
        <p className="max-w-[640px] [font:400_15px/1.6_Inter] text-[#C9BFB0]">{t('verify.hero.short')}</p>
      </header>
      <VerifySectionChrome.Provider value={chrome}>
        <SummaryCard opened={opened} />
        <div className={GROUP}>
          <h2 className={`${MONO_LABEL} text-[#A0978A]`}>{t('verify.group.checks')}</h2>
          <ProgramSection />
          <SourceSection />
          <EvidenceSection />
          <StampSection />
          <SoulboundSection />
          <GateSection />
        </div>
        <div className={GROUP}>
          <h2 className={`${MONO_LABEL} text-[#A0978A]`}>{t('verify.group.reference')}</h2>
          <RpcSection />
          <DurableSection />
          <TrustSection />
        </div>
      </VerifySectionChrome.Provider>
      <p className="max-w-[640px] [font:400_12px/1.6_Inter] text-[#A0978A]" data-testid="verify-intro">{t('verify.intro')}</p>
    </BountyShell>
  );
}
