import { MONO_LABEL } from '@/components/courses/courseStyles';
import { useI18n } from '@/i18n';
import { TeacherAvatar } from './TeacherAvatar';

interface Props {
  name: string;
  slug: string;
  courseCount: number;
}

export function TeacherCard({ name, slug, courseCount }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-4 rounded-[14px] border border-[#262320] bg-[#141210] p-5" data-testid="teacher-card">
      <TeacherAvatar name={name} slug={slug} size={56} />
      <div className="flex min-w-0 flex-col gap-1">
        <span className={`${MONO_LABEL} uppercase tracking-[.1em] text-[#A0978A]`}>{t('video.teacher')}</span>
        <span className="truncate [font:700_26px/1_'Barlow_Condensed']">{name}</span>
        {courseCount > 1 && <span className={`${MONO_LABEL} text-[#3FD17F]`}>{t('video.teacherCourses', { n: courseCount })}</span>}
      </div>
    </div>
  );
}
