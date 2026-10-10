import { ThemeSwatch } from '@/components/wardrobe/ThemeSwatch';
import { THEME_SLOTS } from '@/components/wardrobe/themeGroups';
import { useLearnerAvatar } from '@/hooks/useLearnerAvatar';
import { useCrystals, useEquipTheme } from '@/hooks/useCrystals';
import { useI18n } from '@/i18n';
import { LookChip } from './LookChip';

/** Owned borders, backgrounds and icon colours as labelled rows of the "Meu Tera" gear tab; tap to wear, shown at once. */
export function ThemeRows({ busy, grid }: { busy: boolean; grid: string }) {
  const avatar = useLearnerAvatar();
  const { t } = useI18n();
  const { data } = useCrystals();
  const equip = useEquipTheme();
  if (!data) return null;
  return (
    <>
      {THEME_SLOTS.map(({ slot, title }) => {
        const owned = data.themeItems.filter((i) => i.slot === slot && i.owned);
        if (owned.length < 2 && !owned.some((i) => !i.isDefault)) return null;
        return (
          <div key={slot} className="mt-3" data-testid={`look-theme-${slot}`}>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[#A0978A]">{t(title)}</p>
            <ul className={grid}>
              {owned.map((item) => (
                <li key={item.key}>
                  <LookChip label={item.key === 'border_none' ? t('wardrobe.border.none') : item.title} on={item.equipped} disabled={busy} testId="theme-option" onPick={() => !item.equipped && equip.mutate({ slot, itemKey: item.key })}>
                    <ThemeSwatch item={item} avatar={avatar} compact />
                  </LookChip>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}
