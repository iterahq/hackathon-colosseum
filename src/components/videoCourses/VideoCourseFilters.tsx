import { FOCUS } from '@/components/courses/courseStyles';
import { useI18n } from '@/i18n';
import type { VideoCourseFilter } from '@/types/videoCourses';
import { VIDEO_FILTERS } from '@/utils/videoCourses';

interface Props {
  value: VideoCourseFilter;
  counts: Record<VideoCourseFilter, number>;
  onChange: (filter: VideoCourseFilter) => void;
}

export function VideoCourseFilters({ value, counts, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={t('video.filters')} className="flex gap-2 overflow-x-auto pb-1" data-testid="course-filters">
      {VIDEO_FILTERS.map((filter) => {
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
            {t(`video.filter.${filter}`)}
            <span className={active ? 'text-[#3FD17F]' : 'text-[#6F675C]'}>{counts[filter]}</span>
          </button>
        );
      })}
    </div>
  );
}
