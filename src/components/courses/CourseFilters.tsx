import { useI18n } from '@/i18n';
import { FILTERS, type CourseFilter } from '@/utils/courses';
import { FOCUS } from './courseStyles';

interface Props {
  value: CourseFilter;
  counts: Record<CourseFilter, number>;
  onChange: (filter: CourseFilter) => void;
}

export function CourseFilters({ value, counts, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={t('courses.filters')} className="flex gap-2 overflow-x-auto pb-1" data-testid="course-filters">
      {FILTERS.map((filter) => {
        const active = filter === value;
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={active}
            data-filter={filter}
            onClick={() => onChange(filter)}
            className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 [font:500_13px_JetBrains_Mono] transition-colors ${FOCUS} ${
              active ? 'border-[#3FD17F] bg-[#1C3A2A] text-[#F4EDE2]' : 'border-[#262320] bg-[#141210] text-[#A0978A] hover:border-[#A0978A] hover:text-[#F4EDE2]'
            }`}
          >
            {t(`courses.filter.${filter}`)}
            <span className={active ? 'text-[#3FD17F]' : 'text-[#6F675C]'}>{counts[filter]}</span>
          </button>
        );
      })}
    </div>
  );
}
