import { MoreHorizontal, X } from 'lucide-react';
import { useI18n } from '@/i18n';

interface LiveRoomActionsToggleProps {
  name: string;
  open: boolean;
  onToggle: () => void;
}

/**
 * Um único alvo, sempre no mesmo canto da linha: o ⋯ vira X e o segundo clique
 * fecha as ações. `[@media(hover:none)]` o mantém visível por toque — a aula
 * roda de tablet tanto quanto de notebook.
 */
export function LiveRoomActionsToggle({ name, open, onToggle }: LiveRoomActionsToggleProps) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? t('live.room.actions.close') : t('live.room.actions.open', { name })}
      aria-expanded={open}
      data-testid={open ? 'live-room-actions-close' : 'live-room-actions-open'}
      className={`absolute right-2.5 z-10 grid place-items-center text-muted-foreground transition-opacity hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-evergreen/50 ${
        open
          ? 'top-1.5 w-8 h-8 rounded-full'
          : // Fechado o alvo ocupa a altura inteira da linha: com w-7 h-6 o dedo
            // caía em 24px de altura, metade do mínimo de toque.
            // O revelar por foco é `:focus-visible`, não `:focus`: fechar as
            // ações por clique deixa ESTE botão focado, e com focus-within o ⋯
            // ficava preso visível (e a pontuação escondida) até um clique fora.
            'inset-y-0 w-9 rounded-lg opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
      }`}
    >
      {open ? <X className="w-4 h-4" /> : <MoreHorizontal className="w-4 h-4" />}
    </button>
  );
}
