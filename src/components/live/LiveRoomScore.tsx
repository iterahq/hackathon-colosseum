import { Check } from 'lucide-react';
import { useI18n } from '@/i18n';

/**
 * O placar do instrutor numa linha da sala: acertos e estrelas.
 *
 * O par é CUMULATIVO na aula inteira, mas nasceu sem rótulo — "3/3" lia como
 * "questão 3 de 3", e quem via "4/4" achava que o número discordava do colega
 * (feedback da aula, 2026-08-02). O ✓ diz que o numerador é acerto; o `title`
 * diz de onde vem a contagem.
 */
export function LiveRoomScore({ correct, answered, stars }: { correct: number; answered: number; stars: number }) {
  const { t } = useI18n();
  const label = t('live.room.score.title', { correct, answered });
  return (
    <>
      <span
        className="inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums text-muted-foreground"
        data-testid="live-room-score"
        title={label}
        aria-label={label}
      >
        <Check className="w-3 h-3 shrink-0" aria-hidden />
        {correct}/{answered}
      </span>
      {stars > 0 && (
        <span className="font-mono text-[11px] tabular-nums text-amber-500" data-testid="live-room-stars">
          ⭐{stars}
        </span>
      )}
    </>
  );
}
