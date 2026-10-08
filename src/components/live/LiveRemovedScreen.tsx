import { DoorOpen } from 'lucide-react';
import { useI18n } from '@/i18n';
import { TACTILE_CTA } from '@iterahq/activities';

/**
 * O que o aluno vê quando o professor o tira da sala.
 *
 * Sem esta tela ele veria um "reconectando…" que nunca resolve, porque a linha
 * em `itera.class_removals` passa a NEGAR o join no canal (migration 0029) — o
 * app pareceria quebrado em vez de ter feito o que o professor mandou. O tom é
 * neutro de propósito: a saída acontece na frente da turma, e não é castigo.
 */
export function LiveRemovedScreen({ onLeave }: { onLeave: () => void }) {
  const { t } = useI18n();
  return (
    <div
      className="min-h-screen bg-background flex flex-col items-center justify-center gap-5 px-6 text-center"
      data-testid="live-removed"
    >
      <span className="w-14 h-14 grid place-items-center rounded-2xl bg-muted text-muted-foreground">
        <DoorOpen className="w-7 h-7" />
      </span>
      <div className="space-y-2 max-w-sm">
        <h1 className="font-display text-2xl text-foreground">{t('live.removed.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('live.removed.body')}</p>
      </div>
      <button
        type="button"
        onClick={onLeave}
        className={`inline-flex h-12 items-center justify-center rounded-full px-6 text-sm ${TACTILE_CTA}`}
        data-testid="live-removed-leave"
      >
        {t('live.removed.leave')}
      </button>
    </div>
  );
}
