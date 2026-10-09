import { useI18n, type Locale } from '@/i18n';

interface Props {
  /** `lg` gives the 44px touch targets of the phone menu. */
  size?: 'sm' | 'lg';
  className?: string;
}

const OPTIONS: readonly { id: Locale; label: string; name: string }[] = [
  { id: 'pt', label: 'PT', name: 'Português' },
  { id: 'en', label: 'EN', name: 'English' },
];

/** PT | EN segmented switch: two states, the current one lit. Persists through the same `setLocale` the old menu used. */
export function HeaderLocale({ size = 'sm', className = '' }: Props) {
  const { t, locale, setLocale } = useI18n();
  const h = size === 'lg' ? 'h-11 min-w-11' : 'h-8 min-w-8';

  return (
    <div role="group" aria-label={t('header.lang.aria')} data-testid="header-locale" className={`flex w-fit items-center rounded-full border border-[#262320] bg-[#141210] p-0.5 ${className}`}>
      {OPTIONS.map(({ id, label, name }) => {
        const on = locale === id;
        return (
          <button
            key={id}
            type="button"
            lang={id}
            aria-pressed={on}
            aria-label={name}
            data-locale-option={id}
            onClick={() => !on && setLocale(id)}
            className={`hd-focus ${h} rounded-full px-2 [font:700_11px_JetBrains_Mono] tracking-[.08em] transition-colors ${
              on ? 'bg-[#3FD17F] text-[#0A0908]' : 'text-[#A0978A] hover:text-[#F4EDE2]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
