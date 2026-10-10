import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';

/** The one quiet pointer to what the learner does not own yet: a count, never the items. */
export function ShopTile({ count }: { count: number }) {
  const { t } = useI18n();
  if (count <= 0) return null;
  return (
    <Link to="/shop" data-testid="avatar-picker-shop" className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-dashed border-[#262320] px-3 font-mono text-xs text-[#A0978A] transition-colors hover:border-[#3FD17F]/50 hover:text-[#3FD17F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3FD17F]">
      {t('avatar.look.shop', { n: count })}
    </Link>
  );
}
