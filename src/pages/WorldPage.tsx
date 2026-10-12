import { useState } from 'react';
import { AppTopBar } from '@/components/header/AppTopBar';
import { CrystalSection } from '@/components/world/CrystalSection';
import { FOCUS_SOL_ONLY_SHOP } from '@/config/focus';
import { TeraDialog } from '@/components/world/TeraDialog';
import { TierSection } from '@/components/world/TierSection';
import { WorldHero } from '@/components/world/WorldHero';
import { WorldStory } from '@/components/world/WorldStory';
import { WORLD_GRID, H2 } from '@/components/world/worldStyles';
import { LORE_TIERS } from '@/content/teraLore';
import { CAST_KEYS } from '@/components/world/castArt';
import { useBountySession } from '@/hooks/useBounties';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useTeraCatalog } from '@/hooks/useTeraCatalog';
import { useI18n } from '@/i18n';

/** /world: the lore of Brasa, the crystals and the cast of Teras. Public, static. */
export default function WorldPage() {
  const { t } = useI18n();
  usePageTitle(t('world.title'));
  const [open, setOpen] = useState<string | null>(null);
  const { signedIn } = useBountySession();
  const catalog = useTeraCatalog();
  return (
    <div className="min-h-screen overflow-x-hidden text-[#F4EDE2]" style={WORLD_GRID} data-testid="world-page">
      {signedIn && <AppTopBar />}
      <main className={`mx-auto flex max-w-[1100px] flex-col gap-14 px-4 pt-6 sm:px-8 xl:pt-10 ${signedIn ? 'pb-28 sm:pb-20' : 'pb-20'}`}>
        <WorldHero nav={!signedIn} />
        <WorldStory />
        {!FOCUS_SOL_ONLY_SHOP && <CrystalSection />}
        <section id="cast" className="flex scroll-mt-6 flex-col gap-10" aria-labelledby="world-cast">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="world-cast" className={H2}>{t('world.cast')}</h2>
            <span className="[font:600_11px_JetBrains_Mono] uppercase tracking-[.12em] text-[#A0978A]">{t('world.cast.count', { n: CAST_KEYS.length })}</span>
          </div>
          {LORE_TIERS.map((tier) => (
            <TierSection key={tier} tier={tier} catalog={catalog} onOpen={setOpen} />
          ))}
        </section>
      </main>
      <TeraDialog avatarKey={open} avatars={catalog.avatars} onSelect={setOpen} onClose={() => setOpen(null)} />
    </div>
  );
}
