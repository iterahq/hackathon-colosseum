import { Users } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { ClassPresenceMember } from '@/types/liveClass';

interface LiveRosterCardProps {
  roster: ClassPresenceMember[];
  selfUserId?: string;
}

export function LiveRosterCard({ roster, selfUserId }: LiveRosterCardProps) {
  const { t } = useI18n();
  return (
    <div className="rounded-3xl border border-border bg-card p-5" data-testid="live-roster-card">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-menta" />
        <h3 className="font-display text-foreground text-sm">{t('live.instructor.roster.inRoom')}</h3>
        <span className="ml-auto font-mono text-sm tabular-nums text-menta" data-testid="live-roster-count">
          {roster.length}
        </span>
      </div>
      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('live.instructor.roster.empty')}</p>
      ) : (
        <ul className="space-y-1.5" data-testid="live-roster-list">
          {roster.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 text-sm text-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-menta flex-shrink-0" />
              {m.name}
              {m.userId === selfUserId ? (
                <span className="text-[10px] uppercase tracking-wide text-clay font-mono">
                  · {t('live.instructor.roster.you')}
                </span>
              ) : (
                m.isInstructor && (
                  <span className="text-[10px] uppercase tracking-wide text-clay font-mono">
                    · {t('role.instructor')}
                  </span>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
