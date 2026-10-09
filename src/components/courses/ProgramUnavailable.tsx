import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { WebOnly } from '@/components/shell/WebOnly';
import { useI18n } from '@/i18n';
import { FOCUS } from './courseStyles';

const PRIMARY = `inline-flex h-12 items-center justify-center rounded-xl border-0 border-b-[5px] border-b-[#1F8A4F] bg-[#3FD17F] px-6 [font:700_22px_'Barlow_Condensed'] text-[#0A0908] transition-transform duration-75 active:translate-y-1 active:border-b-[1px] ${FOCUS}`;
const SECONDARY = `inline-flex h-12 items-center justify-center rounded-xl border border-[#2E2A25] bg-[#141210] px-6 [font:700_22px_'Barlow_Condensed'] text-[#F4EDE2] hover:border-[#A0978A] ${FOCUS}`;

/**
 * The route resolved to no program: no such slug, or not enrolled (RLS hides it; the client cannot tell
 * the two apart). One screen on purpose, and the way forward is the catalog, where enrolment happens.
 */
export function ProgramUnavailable({ visitor = false, onRetry }: { visitor?: boolean; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-[#2E2A25] bg-[#141210] p-8" data-testid="program-unavailable">
      <span className="grid h-11 w-11 place-items-center rounded-full border border-[#2E2A25] bg-[#1C1916] text-[#A0978A]">
        <SearchX className="h-5 w-5" />
      </span>
      <h2 className="[font:700_36px/1_'Barlow_Condensed']">{t('program.noAccess.title')}</h2>
      <p className="max-w-[52ch] [font:400_15px/1.5_Inter] text-[#A0978A]">{t('program.noAccess.body')}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {visitor && (
          <WebOnly>
            <Link to="/subscribe" className={PRIMARY} data-testid="program-unavailable-subscribe">
              {t('catalog.locked.cta')}
            </Link>
          </WebOnly>
        )}
        {onRetry && (
          <button type="button" onClick={onRetry} className={SECONDARY} data-testid="program-unavailable-retry">
            {t('common.retry')}
          </button>
        )}
        <Link to="/catalog" className={PRIMARY} data-testid="program-unavailable-catalog">
          {t('program.noAccess.browse')}
        </Link>
        <Link to="/" className={SECONDARY} data-testid="program-unavailable-home">
          {t('program.noAccess.home')}
        </Link>
      </div>
    </div>
  );
}
