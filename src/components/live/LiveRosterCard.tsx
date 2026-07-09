import { Users } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import type { ClassPresenceMember } from '@/types/liveClass';

interface LiveRosterCardProps {
  roster: ClassPresenceMember[];
  selfUserId?: string;
  /** Render as a flush section inside a sidebar panel (drops the card chrome). */
  bare?: boolean;
}

export function LiveRosterCard({ roster, selfUserId, bare = false }: LiveRosterCardProps) {
  const { t } = useI18n();
  const groups = [
    {
      key: 'instructors',
      label: t('live.instructor.roster.instructors'),
      members: roster.filter((m) => m.isInstructor),
    },
    {
      key: 'learners',
      label: t('live.instructor.roster.learners'),
      members: roster.filter((m) => !m.isInstructor),
    },
  ].filter((g) => g.members.length > 0);

  return (
    <div className={bare ? 'p-5' : 'rounded-3xl border border-border bg-card p-5'} data-testid="live-roster-card">
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
        <div
          className="space-y-3 max-h-56 overflow-y-auto lg:max-h-none lg:overflow-visible"
          data-testid="live-roster-list"
        >
          {groups.map((g) => (
            <div key={g.key} data-testid={`live-roster-${g.key}`}>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-mono mb-1.5">
                {g.label}
              </p>
              <ul className="space-y-1.5">
                {g.members.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2 text-sm text-foreground">
                    <LiveAvatar name={m.name} avatarUrl={m.avatarUrl} size="w-6 h-6" />
                    {m.name}
                    {m.userId === selfUserId && (
                      <span className="text-[10px] uppercase tracking-wide text-clay font-mono">
                        · {t('live.instructor.roster.you')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
