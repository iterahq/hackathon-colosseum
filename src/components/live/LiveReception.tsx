import { motion } from 'framer-motion';
import { DoorOpen, Users } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { ClassPresenceMember } from '@/types/liveClass';

interface LiveReceptionProps {
  roster: ClassPresenceMember[];
}

export function LiveReception({ roster }: LiveReceptionProps) {
  const { t } = useI18n();
  const learners = roster.filter((m) => !m.isInstructor);

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

      {learners.length > 0 && (
        <ul className="mt-4 flex flex-wrap items-center justify-center gap-2" data-testid="live-reception-roster">
          {learners.map((m) => (
            <li
              key={m.userId}
              className="px-3 h-8 inline-flex items-center rounded-full bg-card border border-border text-xs text-foreground"
            >
              {m.name}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
