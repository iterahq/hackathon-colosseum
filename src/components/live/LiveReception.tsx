import { motion } from 'framer-motion';
import { DoorOpen, Users } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { LiveGuestBadge } from '@/components/live/LiveGuestBadge';
import type { ClassPresenceMember } from '@/types/liveClass';

const MAX_CHIPS = 24;

interface LiveReceptionProps {
  roster: ClassPresenceMember[];
  /**
   * Durable guest list for this session (`itera.class_guests`), merged over the
   * presence-supplied `isGuest`. Instructors pass it so the badge in the waiting
   * room does not depend on the guest's own client telling the truth (ADR-9).
   */
  guestUserIds?: string[];
}

export function LiveReception({ roster, guestUserIds }: LiveReceptionProps) {
  const { t } = useI18n();
  const shown = roster.slice(0, MAX_CHIPS);
  const overflow = roster.length - shown.length;
  const guests = new Set(guestUserIds ?? []);
  const isGuest = (m: ClassPresenceMember) => m.isGuest === true || guests.has(m.userId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 rounded-3xl border border-clay/40 bg-gradient-to-b from-clay/10 to-transparent p-10 md:p-12 text-center"
      data-testid="live-reception"
    >
      <div className="w-16 h-16 mx-auto rounded-2xl bg-clay/15 border border-clay/40 flex items-center justify-center text-clay">
        <DoorOpen className="w-8 h-8" />
      </div>
      <h2 className="font-display text-2xl text-foreground mt-5">{t('live.waiting.title')}</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">{t('live.waiting.subtitle')}</p>

      <div className="mt-7 inline-flex items-center gap-2 px-4 h-9 rounded-full border border-border bg-card/60 text-sm">
        <Users className="w-4 h-4 text-menta" />
        <span className="font-mono tabular-nums text-menta" data-testid="live-reception-count">
          {roster.length}
        </span>
        <span className="text-muted-foreground">{t('live.reception.inRoom')}</span>
      </div>

      {roster.length > 0 && (
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-2" data-testid="live-reception-roster">
          {shown.map((m) => (
            <li
              key={m.userId}
              className={`pl-1 pr-3 h-8 inline-flex items-center gap-1.5 rounded-full border text-xs ${
                m.isInstructor
                  ? 'border-clay/50 bg-clay/10 text-clay'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              <LiveAvatar name={m.name} avatarUrl={m.avatarUrl} size="w-6 h-6" />
              {m.name}
              {m.isInstructor && (
                <span className="text-[10px] uppercase tracking-wide font-mono opacity-80">
                  {t('role.instructor')}
                </span>
              )}
              {isGuest(m) && <LiveGuestBadge />}
            </li>
          ))}
          {overflow > 0 && (
            <li className="px-3 h-8 inline-flex items-center rounded-full bg-card border border-border text-xs text-muted-foreground">
              +{overflow}
            </li>
          )}
        </ul>
      )}
    </motion.div>
  );
}
