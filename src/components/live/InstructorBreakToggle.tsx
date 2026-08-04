import { Coffee } from 'lucide-react';
import { useI18n } from '@/i18n';

/**
 * Abre/fecha a pausa para dúvidas da sala inteira. Sinalização pura: não trava
 * resposta nem timer — avançar de atividade já retoma a aula sozinho.
 */
export function InstructorBreakToggle({
  onBreak,
  busy,
  onToggle,
}: {
  onBreak: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();

  return (
    <button
      onClick={onToggle}
      disabled={busy}
      aria-pressed={onBreak}
      data-testid="instructor-break"
      className={`w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-full border text-sm transition-colors disabled:opacity-40 ${
        onBreak
          ? 'border-streak bg-streak/15 text-streak'
          : 'border-border bg-background text-foreground hover:border-evergreen/40'
      }`}
    >
      <Coffee className="w-3.5 h-3.5" />{' '}
      {onBreak ? t('live.instructor.control.breakOff') : t('live.instructor.control.break')}
    </button>
  );
}
