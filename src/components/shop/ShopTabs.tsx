import { useI18n } from '@/i18n';
import { formatCount } from './pay';
import { FOCUS } from './shopStyles';

export type ShopSection = 'avatars' | 'lives' | 'borders' | 'outfits' | 'certs' | 'backgrounds' | 'icons';

/** The shelf id of each section: the wardrobe links to these. */
export const SECTION_ID: Record<ShopSection, string> = { avatars: 'shop-avatars', lives: 'shop-lives', borders: 'shop-borders', outfits: 'shop-outfits', certs: 'shop-certs', backgrounds: 'shop-backgrounds', icons: 'shop-icons' };
export const sectionOfId = (id: string): ShopSection | null => (Object.keys(SECTION_ID) as ShopSection[]).find((s) => SECTION_ID[s] === id) ?? null;

const LABEL: Record<ShopSection, string> = { avatars: 'shop.nav.avatars', lives: 'shop.nav.lives', borders: 'shop.nav.borders', outfits: 'shop.nav.clothes', certs: 'shop.nav.certs', backgrounds: 'shop.nav.backgrounds', icons: 'shop.nav.icons' };

interface Props {
  sections: ShopSection[];
  active: ShopSection;
  onChange: (section: ShopSection) => void;
  /** Crystal balance when known: shown at the end of the row. */
  balance?: number | null;
}

/** Sticky row of category chips: one section is shown at a time, so the page never grows with the catalogue. */
export function ShopTabs({ sections, active, onChange, balance = null }: Props) {
  const { t, locale } = useI18n();
  return (
    <nav className="sticky top-0 z-20 -mx-4 border-b border-[#262320] bg-[#0A0908]/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8" aria-label={t('shop.nav.label')} data-testid="shop-sections">
      <div className="flex items-center gap-3">
      <div role="tablist" aria-label={t('shop.nav.label')} className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section) => {
          const selected = section === active;
          return (
            <button key={section} type="button" role="tab" id={`${SECTION_ID[section]}-tab`} aria-selected={selected} aria-controls={SECTION_ID[section]} onClick={() => onChange(section)} data-testid={`shop-section-${section}`} className={`min-h-11 flex-none rounded-full border px-4 [font:700_14px_Inter] ${FOCUS} ${selected ? 'border-[#3FD17F] bg-[#3FD17F] text-[#0A0908]' : 'border-[#2E2A25] bg-[#141210] text-[#C9BFB0] hover:border-[#5E574E] hover:text-[#F4EDE2]'}`}>
              {t(LABEL[section])}
            </button>
          );
        })}
      </div>
      {balance != null && (
        <span className="hidden flex-none [font:700_12px_JetBrains_Mono] text-[#A0978A] sm:block" data-testid="shop-balance">
          {t('shop.pay.balance', { n: formatCount(balance, locale) })}
        </span>
      )}
      </div>
    </nav>
  );
}
