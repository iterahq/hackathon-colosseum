import { useI18n } from '@/i18n';
import { LockGlyph } from './LockGlyph';

interface Props {
  title: string;
  total: number;
  /** Days stamped on chain; a certification with no stored row still shows them. */
  done?: number;
  locked?: boolean;
  width?: number;
}

/** The certificate before the server draws one: same square, same row of day stamps, all of them still to earn. */
export function CertificateBlank({ title, total, done = 0, locked = false, width = 260 }: Props) {
  const { t } = useI18n();
  const days = Math.max(1, total);
  const r = Math.min(34, (320 - (days - 1) * 8) / (2 * days));
  const step = days === 1 ? 0 : (320 - 2 * r) / (days - 1);
  const label = `${title}: ${t('passport.days', { done, total })}`;
  return (
    <svg viewBox="0 0 400 400" width={width} height={width} role="img" aria-label={label} data-testid="certificate-blank" data-locked={locked} className="h-auto max-w-full shrink-0">
      <rect x="6" y="6" width="388" height="388" rx="26" fill="#141210" stroke="#3A342D" strokeWidth="3" />
      <rect x="18" y="18" width="364" height="364" rx="18" fill="none" stroke="#2E2A25" strokeWidth="1" strokeDasharray="3 6" />
      <text x="40" y="62" fontFamily="'JetBrains Mono', monospace" fontWeight={700} fontSize="12" letterSpacing="3" fill="#A0978A">
        {t('cert.label')}
      </text>
      <text x="40" y="112" fontFamily="'Barlow Condensed', sans-serif" fontWeight={700} fontSize="44" fill="#C9BFB0">
        {title.length > 18 ? `${title.slice(0, 17)}…` : title}
      </text>
      {locked ? (
        <g transform="translate(168 172) scale(4)" color="#6F675C">
          <LockGlyph size={16} />
        </g>
      ) : (
        Array.from({ length: days }, (_, i) => {
          const cx = days === 1 ? 200 : 40 + r + i * step;
          const filled = i < done;
          return (
            <g key={i}>
              <circle cx={cx} cy={220} r={r} fill={filled ? '#1C3A2A' : 'none'} stroke={filled ? '#3FD17F' : '#5E574E'} strokeWidth="2.5" strokeDasharray={filled ? undefined : '6 5'} />
              <text x={cx} y={220 + r * 0.24} textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontWeight={700} fontSize={r * 0.7} fill={filled ? '#3FD17F' : '#6F675C'}>
                {i + 1}
              </text>
            </g>
          );
        })
      )}
      <text x="40" y="352" fontFamily="'Barlow Condensed', sans-serif" fontWeight={700} fontSize="34" fill="#A0978A">
        {locked ? t('passport.locked') : t('passport.days', { done, total })}
      </text>
      <title>{label}</title>
    </svg>
  );
}
