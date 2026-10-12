import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import type { TeraOrigin } from '@/types/tera';
import { OriginBadge } from './OriginBadge';

/** The origin of a Tera the learner holds, for a tile: the chip, whether it can change hands, and the link to its proof. */
export function TeraOriginLine({ origin }: { origin: TeraOrigin }) {
  const { t } = useI18n();
  return (
    <span className="flex flex-col items-center gap-0.5" data-testid="tera-origin-line">
      <OriginBadge origin={origin} className="justify-center" />
      {origin.proof && (
        <Link to={`/c/${origin.proof.asset}`} className="inline-flex min-h-8 items-center [font:600_11px_JetBrains_Mono] text-[#3FD17F] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]" data-testid="tera-origin-proof">
          {t('origin.proof')} →
        </Link>
      )}
    </span>
  );
}
