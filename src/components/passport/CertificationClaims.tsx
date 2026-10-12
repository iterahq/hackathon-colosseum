import { useMemo } from 'react';
import { CapabilityGraphSection } from '@/components/graph/CapabilityGraphSection';
import { ANONYMOUS_WALLET } from '@/components/graph/capabilityView';
import { TeraLoader } from '@/components/tera/TeraLoader';
import { useLearnerProfile } from '@/hooks/useLearnerProfile';
import { useI18n } from '@/i18n';
import type { Capabilities } from '@/types/learnerProfile';

/** The trail of the map that belongs to a certification: by name ("Week 1 · HTML" holds "HTML"), else by position. */
export function trailOf(capabilities: Capabilities, title: string, position: number): number | null {
  const wanted = title.trim().toLowerCase();
  const tail = (text: string) => text.slice(text.indexOf(' · ') >= 0 ? text.indexOf(' · ') + 3 : 0).trim().toLowerCase();
  const byName = capabilities.trails.find((tr) => tail(tr.title) === wanted);
  if (byName) return byName.trail;
  const ordered = [...capabilities.trails].sort((a, b) => a.trail - b.trail);
  return ordered[position]?.trail ?? null;
}

/** The map cut down to one trail: its claims, and only the prerequisites that live in it. */
export function claimsOfTrail(capabilities: Capabilities, trail: number): Capabilities {
  const nodes = capabilities.nodes.filter((n) => n.trail === trail);
  const ids = new Set(nodes.map((n) => n.id));
  return {
    ...capabilities,
    trails: capabilities.trails.filter((tr) => tr.trail === trail),
    nodes: nodes.map((n) => ({ ...n, requires: n.requires.filter((id) => ids.has(id)) })),
    total: nodes.length,
    verifiedCount: nodes.filter((n) => n.status === 'verified').length,
    next: capabilities.next && ids.has(capabilities.next) ? capabilities.next : null,
  };
}

interface Props {
  wallet: string | null;
  /** The certification's name, as the list shows it. */
  title: string;
  /** Its position among the program's certifications. */
  position: number;
}

/** The claims map of one certification: what it proves, claim by claim, read from the chain in this browser. */
export function CertificationClaims({ wallet, title, position }: Props) {
  const { t, locale } = useI18n();
  const query = useLearnerProfile(wallet ?? ANONYMOUS_WALLET, locale);
  const all = query.data?.status === 'ok' ? query.data.profile.capabilities : null;
  const claims = useMemo(() => {
    if (!all) return null;
    const trail = trailOf(all, title, position);
    return trail === null ? null : claimsOfTrail(all, trail);
  }, [all, title, position]);

  if (query.isPending) return <TeraLoader size="md" label={t('graph.loading')} />;
  if (query.isError || !claims) {
    return (
      <div role="alert" className="rounded-[14px] border border-[#262320] bg-[#141210] p-4 [font:500_14px_Inter] text-[#C9BFB0]" data-testid="certification-claims-failed">
        {t('graph.failed')}
        <button type="button" onClick={() => void query.refetch()} className="mt-3 block h-11 rounded-lg border border-[#3FD17F] px-4 [font:700_13px_JetBrains_Mono] text-[#3FD17F]">
          {t('graph.retry')}
        </button>
      </div>
    );
  }
  return (
    <div data-testid="certification-claims">
      <CapabilityGraphSection wallet={wallet ?? ANONYMOUS_WALLET} capabilities={claims} single />
    </div>
  );
}
