import type { ReactNode } from 'react';
import { LearnerAvatar } from '@/components/avatar/LearnerAvatar';
import { TeraOutfit } from '@/components/tera/TeraOutfit';
import { useI18n } from '@/i18n';
import { loreOf } from '@/lib/teraLoreSafe';
import type { LearnerAvatar as Avatar } from '@/types/avatar';
import type { LookTab, ProfileLook } from '@/utils/profileLook';
import { LookChip } from './LookChip';
import { ShopTile } from './ShopTile';
import { ThemeRows } from './ThemeRows';

interface Props {
  tab: LookTab;
  look: ProfileLook;
  currentKey: string;
  busy: boolean;
  onAvatar: (avatar: Avatar) => void;
  onOutfit: (key: string | null) => void;
}

const GRID = 'grid grid-cols-4 gap-1 sm:grid-cols-[repeat(auto-fill,minmax(88px,1fr))]';

function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="mt-3 first:mt-0">
      {label && <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[#A0978A]">{label}</p>}
      <ul className={GRID}>{children}</ul>
    </div>
  );
}

/** The tab body: one tidy scrolling grid (two rows tall), then the quiet shop tile. */
export function LookPanel({ tab, look, currentKey, busy, onAvatar, onOutfit }: Props) {
  const { t, locale } = useI18n();
  const name = (a: Avatar) => loreOf(a.key, locale)?.name ?? a.title;
  const avatarChips = (list: Avatar[]) =>
    list.map((a) => (
      <li key={a.key}>
        <LookChip label={name(a)} title={a.tierName !== a.title ? `${name(a)} · ${a.tierName}` : name(a)} on={a.key === currentKey} disabled={busy} rarity={a.rarity} testId="avatar-option" onPick={() => onAvatar(a)}>
          <LearnerAvatar avatar={a} size="lg" className="!h-14 !w-14 sm:!h-16 sm:!w-16" />
        </LookChip>
      </li>
    ));
  const hasOutfitRow = tab === 'gear' && look.outfits.length > 0;
  const worn = look.outfits.some((o) => o.equipped);
  const empty = tab === 'gear' ? look.owned.gear === 0 : tab === 'looks' && look.looks.length === 0;
  return (
    <div role="tabpanel" id="look-panel" aria-labelledby={`look-tab-${tab}`} data-testid="look-panel">
      {empty ? (
        <p className="rounded-xl border border-[#262320] px-3 py-6 text-center font-sans text-sm text-[#A0978A]">{t(`avatar.look.empty.${tab}`)}</p>
      ) : (
        <div className="max-h-[348px] overflow-y-auto pr-1 [scrollbar-width:thin]">
          {tab === 'faces' && <Row>{avatarChips(look.faces)}</Row>}
          {tab === 'looks' && <Row>{avatarChips(look.looks)}</Row>}
          {tab === 'gear' && look.gearAvatars.length > 0 && <Row label={hasOutfitRow ? t('avatar.look.row.avatars') : undefined}>{avatarChips(look.gearAvatars)}</Row>}
          {hasOutfitRow && (
            <Row label={t('avatar.look.row.outfits')}>
              <li>
                <LookChip label={t('avatar.look.outfit.none')} on={look.outfitsAllowed && !worn} disabled={busy || !look.outfitsAllowed} testId="outfit-none" onPick={() => onOutfit(null)}>
                  <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed border-[#3A352F] text-[#A0978A] sm:h-16 sm:w-16">∅</span>
                </LookChip>
              </li>
              {look.outfits.map((o) => (
                <li key={o.key}>
                  <LookChip label={o.title} on={o.equipped && look.outfitsAllowed} disabled={busy || !look.outfitsAllowed} testId="outfit-option" onPick={() => onOutfit(o.key)}>
                    <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#0F0D0B] sm:h-16 sm:w-16">
                      <TeraOutfit mood="neutral" size="bubble" idle={false} outfit={o.key} />
                    </span>
                  </LookChip>
                </li>
              ))}
            </Row>
          )}
          {tab === 'gear' && <ThemeRows busy={busy} grid={GRID} />}
        </div>
      )}
      {hasOutfitRow && !look.outfitsAllowed && <p className="mt-2 font-sans text-xs text-[#A0978A]" data-testid="outfit-locked">{t('avatar.look.outfit.locked')}</p>}
      <ShopTile count={look.missing[tab]} />
    </div>
  );
}
