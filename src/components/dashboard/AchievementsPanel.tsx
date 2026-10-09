import { useI18n } from '@/i18n';
import type { AchievementView } from '@/types/achievements';

interface Props {
  items: AchievementView[];
  earned: number;
}

const PLACEHOLDER_SLOTS = 9;
const explorerUrl = (asset: string) => `https://explorer.solana.com/address/${encodeURIComponent(asset)}?cluster=devnet`;

function glyphOf(item: AchievementView, text: string): string {
  const art = item.art;
  const set = typeof art.glyph === 'string' ? art.glyph : typeof art.label === 'string' ? art.label : '';
  return (set || text.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3)).toUpperCase();
}

function Medal({ ok, glyph }: { ok: boolean; glyph: string }) {
  return (
    <span
      className={`box-border grid h-[76px] w-[76px] place-items-center rounded-full [font:700_15px_JetBrains_Mono] ${
        ok ? '-rotate-6 border-b-[5px] border-b-[#1F8A4F] bg-[#3FD17F] text-[#0A0908]' : 'border-2 border-dashed border-[#2E2A25] bg-transparent text-[#8A8276]'
      }`}
    >
      {glyph}
    </span>
  );
}

export function AchievementsPanel({ items, earned }: Props) {
  const { t, tText } = useI18n();
  const total = items.length || PLACEHOLDER_SLOTS;

  return (
    <section className="flex flex-col gap-5 rounded-[14px] border border-[#262320] bg-[#141210] px-5 py-6 sm:px-7" data-testid="achievements">
      <div className="flex items-baseline justify-between">
        <h2 className="[font:700_32px_'Barlow_Condensed']">{t('dash.achievements.title')}</h2>
        <span className="[font:500_13px_JetBrains_Mono] text-[#A0978A]">{t('dash.achievements.count', { earned, total })}</span>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-[22px] sm:grid-cols-5">
        {items.length === 0
          ? Array.from({ length: PLACEHOLDER_SLOTS }, (_, i) => (
              <div key={i} data-testid="achievement-slot" data-state="locked" className="flex flex-col items-center gap-2 text-center">
                <Medal ok={false} glyph="???" />
                <span className="[font:600_14px_Inter] text-[#A0978A]">???</span>
                <span className="[font:500_11px_JetBrains_Mono] text-[#A0978A]">{t('dash.achievements.locked')}</span>
              </div>
            ))
          : items.map((item) => {
              const ok = Boolean(item.earned);
              const title = tText(item.title);
              const minted = item.earned?.mintStatus === 'minted' && item.earned.assetAddress;
              return (
                <div key={item.key} data-testid="achievement-slot" data-state={ok ? 'earned' : 'locked'} className="flex min-w-0 flex-col items-center gap-2 text-center">
                  <Medal ok={ok} glyph={ok ? glyphOf(item, title) : '???'} />
                  <span className="[font:600_14px_Inter]" style={{ color: ok ? '#F4EDE2' : '#A0978A' }}>
                    {title}
                  </span>
                  <span className="line-clamp-2 [font:500_11px_JetBrains_Mono] text-[#A0978A]">{tText(item.description)}</span>
                  {minted && item.earned?.assetAddress && (
                    <a
                      href={explorerUrl(item.earned.assetAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t('dash.achievements.explorer')}
                      data-testid="achievement-onchain"
                      className="rounded border border-[#3FD17F] px-1.5 py-0.5 [font:700_10px_JetBrains_Mono] text-[#3FD17F] hover:bg-[#1C3A2A]"
                    >
                      ◎ {t('dash.achievements.onChain')}
                    </a>
                  )}
                </div>
              );
            })}
      </div>
    </section>
  );
}
