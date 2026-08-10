import type { LucideIcon } from 'lucide-react';

/**
 * Um botão do menu de ações do aluno. Ícone + rótulo curto sempre juntos: a aula
 * é conduzida de tablet tanto quanto de notebook, e ícone puro num alvo pequeno
 * é onde o professor erra de linha.
 */
export function LiveRoomActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = 'neutral',
  testId,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'danger';
  testId: string;
}) {
  const toneClass =
    tone === 'primary'
      ? 'border-streak/40 bg-streak/10 text-streak hover:bg-streak/20'
      : tone === 'danger'
        ? 'border-transparent text-destructive/80 hover:bg-destructive/10 hover:text-destructive'
        : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={`h-8 px-2.5 shrink-0 inline-flex items-center gap-1.5 rounded-full border text-[11px] font-medium transition-colors disabled:opacity-50 ${toneClass}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
