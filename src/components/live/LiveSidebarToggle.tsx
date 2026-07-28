import { Users, ChevronDown } from 'lucide-react';
import { useI18n } from '@/i18n';

/**
 * Learner-only, phone-only: on a narrow screen the room list is a drawer, so the
 * activity keeps the whole viewport until the learner asks to see the class.
 */
export function LiveSidebarToggle({
  open,
  count,
  onToggle,
}: {
  open: boolean;
  count: number;
  onToggle: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      data-testid="live-sidebar-toggle"
      className="lg:hidden flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-muted-foreground"
    >
      <span className="inline-flex items-center gap-1.5 font-medium">
        <Users className="w-4 h-4" /> {t('live.sidebar.classroom')}
        <span className="text-muted-foreground/70">
          · {t('live.sidebar.online', { count: String(count) })}
        </span>
      </span>
      <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}
