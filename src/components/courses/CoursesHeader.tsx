import { useI18n } from '@/i18n';

export function CoursesHeader({ count }: { count: number }) {
  const { t } = useI18n();
  return (
    <header className="flex flex-col gap-2">
      <span className="[font:500_13px_JetBrains_Mono] text-[#3FD17F]">{t('courses.prompt', { n: count })}</span>
      <h1 className="[font:700_64px/0.95_'Barlow_Condensed'] max-sm:text-[48px]">{t('courses.title')}</h1>
      <p className="max-w-[56ch] [font:400_16px/1.5_Inter] text-[#A0978A]">{t('courses.sub')}</p>
    </header>
  );
}
