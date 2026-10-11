import { INPUT, LABEL } from '@/components/bounty/bountyUi';
import { BTN_TEXT } from '@/components/shop/shopStyles';
import { useI18n } from '@/i18n';
import type { TalentCapability, TalentFilters as Filters } from '@/types/talent';

const DAY_CHOICES = [1, 3, 5, 10];

interface Props {
  filters: Filters;
  capabilities: TalentCapability[];
  onChange: (next: Filters) => void;
}

export function TalentFilters({ filters, capabilities, onChange }: Props) {
  const { t } = useI18n();
  const active = filters.capability !== '' || filters.minDays > 0;
  return (
    <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" aria-label={t('talent.filters.aria')} onSubmit={(event) => event.preventDefault()} data-testid="talent-filters">
      <label className="flex min-w-0 flex-col gap-1.5 sm:w-[320px]">
        <span className={LABEL}>{t('talent.filters.capability')}</span>
        <select className={INPUT} value={filters.capability} onChange={(event) => onChange({ ...filters, capability: event.target.value })} data-testid="talent-filter-capability">
          <option value="">{t('talent.filters.capability.any')}</option>
          {filters.capability !== '' && !capabilities.some((entry) => entry.key === filters.capability) && <option value={filters.capability}>{filters.capability}</option>}
          {capabilities.map((entry) => (
            <option key={entry.key} value={entry.key}>{entry.title}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 sm:w-[220px]">
        <span className={LABEL}>{t('talent.filters.minDays')}</span>
        <select className={INPUT} value={filters.minDays} onChange={(event) => onChange({ ...filters, minDays: Number(event.target.value) })} data-testid="talent-filter-days">
          <option value={0}>{t('talent.filters.minDays.any')}</option>
          {DAY_CHOICES.map((n) => (
            <option key={n} value={n}>{t('talent.filters.minDays.n', { n })}</option>
          ))}
        </select>
      </label>
      {active && (
        <button type="button" className={BTN_TEXT} onClick={() => onChange({ capability: '', minDays: 0 })} data-testid="talent-filter-clear">
          {t('talent.filters.clear')}
        </button>
      )}
    </form>
  );
}
