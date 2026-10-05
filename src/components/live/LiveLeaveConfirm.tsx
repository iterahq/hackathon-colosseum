import { useEffect, useRef } from 'react';
import { LogOut } from 'lucide-react';
import { useI18n } from '@/i18n';

/**
 * Confirmação de "sair da aula" do aluno, ancorada no próprio X do chrome.
 *
 * Bolha na página em vez de `window.confirm` pelo mesmo motivo do
 * `CodeResetControl`: o diálogo nativo é bloqueável, sem estilo, sem tradução, e
 * o app também roda embedado. E sem backdrop de propósito — a aula segue ao vivo
 * atrás disto, e escurecer a tela toda por causa de um clique no X custaria a
 * atividade em andamento.
 *
 * O foco inicial vai no botão que NÃO sai: um Enter reflexo não pode tirar o
 * aluno da aula.
 */
export function LiveLeaveConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const stayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stayRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-labelledby="live-leave-title"
      aria-describedby="live-leave-body"
      data-testid="live-leave-confirm"
      className="w-68 rounded-2xl border border-border bg-card p-4 shadow-xl"
    >
      <p id="live-leave-title" className="text-sm font-medium text-foreground">
        {t('live.leave.title')}
      </p>
      <p id="live-leave-body" className="mt-1 text-xs text-muted-foreground">
        {t('live.leave.body')}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          ref={stayRef}
          type="button"
          onClick={onCancel}
          data-testid="live-leave-stay"
          className="flex-1 h-9 rounded-full bg-evergreen text-sm font-medium text-obsidiana hover:bg-evergreen-hi transition-colors"
        >
          {t('live.leave.stay')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          data-testid="live-leave-yes"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          {t('live.leave.confirm')}
        </button>
      </div>
    </div>
  );
}
