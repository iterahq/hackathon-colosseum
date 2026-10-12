import { ArrowLeftRight, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { TeraOrigin } from '@/types/tera';
import { OriginBadge } from './OriginBadge';

/** The origin of a Tera the learner holds, for a narrow tile: the chip, then whether it can change hands, then the link to its proof. */
export function TeraOriginLine({ origin }: { origin: TeraOrigin }) {
  const { t } = useI18n();
  const Icon = origin.transferable ? ArrowLeftRight : Lock;
  return (
    <span className="flex flex-col items-center gap-1" data-testid="tera-origin-line">
      <OriginBadge origin={origin} transfer={false} className="justify-center" />
      <span className="inline-flex items-center gap-1 whitespace-nowrap [font:600_10px/1_JetBrains_Mono] uppercase tracking-[.04em] text-[#A0978A]" data-testid="tera-origin-transfer">
        <Icon size={10} aria-hidden />
        {t(origin.transferable ? 'origin.transferable' : 'origin.bound')}
      </span>
      {origin.proof && (
        <Link to={`/c/${origin.proof.asset}`} className="inline-flex min-h-8 items-center [font:600_11px_JetBrains_Mono] text-[#3FD17F] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]" data-testid="tera-origin-proof">
          {t('origin.proof')} →
        </Link>
      )}
    </span>
  );
}
