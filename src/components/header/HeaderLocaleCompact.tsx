import { useI18n } from '@/i18n';
import './header.css';

const OTHER_NAME = { pt: 'English', en: 'Português' } as const;

/** One pill showing the OTHER language, for a phone header with no room for the two-state switch. Tapping it switches. */
export function HeaderLocaleCompact({ className = '' }: { className?: string }) {
  const { t, locale, toggleLocale } = useI18n();
  return (
    <button
      type="button"
      lang={locale === 'pt' ? 'en' : 'pt'}
      aria-label={OTHER_NAME[locale]}
      onClick={toggleLocale}
      data-testid="header-locale-compact"
      className={`hd-focus inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-[#262320] bg-[#141210] px-2.5 [font:700_11px_JetBrains_Mono] tracking-[.08em] text-[#C9BFB0] hover:text-[#F4EDE2] ${className}`}
    >
      {t('locale.switch')}
    </button>
  );
}
