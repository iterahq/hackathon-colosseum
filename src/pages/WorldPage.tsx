import { useMemo, useState } from 'react';
import { AppTopBar } from '@/components/header/AppTopBar';
import { CrystalSection } from '@/components/world/CrystalSection';
import { FOCUS_BUILD, FOCUS_SOL_ONLY_SHOP } from '@/config/focus';
import { TeraDialog } from '@/components/world/TeraDialog';
import { TierSection } from '@/components/world/TierSection';
import { WorldCollection } from '@/components/world/WorldCollection';
import { ownedTerasOf } from '@/components/world/obtain';
import { WorldHero } from '@/components/world/WorldHero';
import { WorldStory } from '@/components/world/WorldStory';
import { WORLD_GRID, H2 } from '@/components/world/worldStyles';
import { LORE_TIERS, loreTierOf } from '@/content/teraLore';
import { CAST_KEYS } from '@/components/world/castArt';
import { useBountySession } from '@/hooks/useBounties';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useShop } from '@/hooks/useShop';
import { useTeraCatalog } from '@/hooks/useTeraCatalog';
import { useI18n } from '@/i18n';

/** The tiers the cast lists: a Tera is earned or bought, so the starter faces are not a tier of it. */
const CAST_TIERS = LORE_TIERS.filter((tier) => !(FOCUS_BUILD && tier === 'free'));

/** /world: the lore of Brasa and the cast of Teras. Public. A signed-in learner sees which Teras the wallet holds: those in colour, every other one locked. */
export default function WorldPage() {
  const { t } = useI18n();
  usePageTitle(t('world.title'));
  const [open, setOpen] = useState<string | null>(null);
  const { signedIn } = useBountySession();
  const catalog = useTeraCatalog();
  const shop = useShop({ enabled: signedIn });
  // Known only once the learner's list answered: until then nothing is drawn as locked.
  const owned = useMemo(() => (signedIn && shop.data ? ownedTerasOf(shop.data) : null), [signedIn, shop.data]);
  const cast = useMemo(() => CAST_KEYS.filter((key) => CAST_TIERS.includes(loreTierOf(key, catalog.avatars))), [catalog.avatars]);
  return (
    <div className="min-h-screen overflow-x-hidden text-[#F4EDE2]" style={WORLD_GRID} data-testid="world-page">
      {signedIn && <AppTopBar />}
      <main className={`mx-auto flex max-w-[1100px] flex-col gap-14 px-4 pt-6 sm:px-8 xl:pt-10 ${signedIn ? 'pb-28 sm:pb-20' : 'pb-20'}`}>
        <WorldHero nav={!signedIn} />
        {/* What the wallet holds comes before the story: the Tera just earned or bought is on the first screen. */}
        {owned && <WorldCollection owned={owned} keys={cast} avatars={catalog.avatars} onOpen={setOpen} />}
        <WorldStory />
        {!FOCUS_SOL_ONLY_SHOP && <CrystalSection />}
        <section id="cast" className="flex scroll-mt-6 flex-col gap-10" aria-labelledby="world-cast">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="world-cast" className={H2}>{t('world.cast')}</h2>
            <span className="[font:600_11px_JetBrains_Mono] uppercase tracking-[.12em] text-[#A0978A]">{t('world.cast.count', { n: cast.length })}</span>
          </div>
          {CAST_TIERS.map((tier) => (
            <TierSection key={tier} tier={tier} catalog={catalog} owned={owned} onOpen={setOpen} />
          ))}
        </section>
      </main>
      <TeraDialog avatarKey={open} catalog={catalog} owned={owned} onSelect={setOpen} onClose={() => setOpen(null)} />
    </div>
  );
}
