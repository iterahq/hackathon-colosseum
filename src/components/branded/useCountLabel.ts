import { useI18n } from '@/i18n';

/** Singular-aware "N label" formatter ("1 lição", "2 lições"). */
export function useCountLabel() {
  const { t } = useI18n();
  return (n: number, one: string, many: string) => `${n} ${t(n === 1 ? one : many).toLowerCase()}`;
}
