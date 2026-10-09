import { useI18n } from '@/i18n';
import type { PassportMedal } from '@/types/achievements';
import type { TrailColor } from '@/types/trailDashboard';
import { Medal } from './Medal';

interface Props {
  medals: PassportMedal[];
  color: TrailColor;
  size?: number;
}

/** A 1 px shelf line with the medals standing on it; locked ones show what they ask for. */
export function MedalShelf({ medals, color, size = 76 }: Props) {
  const { t } = useI18n();
  if (medals.length === 0) return null;
  return (
    <div className="flex flex-col" data-testid="medal-shelf" role="list" aria-label={t('passport.medals')}>
      <div className="flex gap-3 overflow-x-auto px-1 pb-3 pt-2">
        {medals.map((m) => (
          <div key={m.key} role="listitem">
            <Medal
              glyph={m.glyph}
              kind={m.kind}
              credentialId={m.credentialId}
              title={m.title}
              caption={m.description}
              earned={m.earned}
              minted={m.mintStatus === 'minted'}
              txSignature={m.txSignature}
              assetAddress={m.assetAddress}
              accent={color.c}
              accentDark={color.cd}
              size={size}
            />
          </div>
        ))}
      </div>
      <div className="h-px bg-[#262320]" />
    </div>
  );
}
