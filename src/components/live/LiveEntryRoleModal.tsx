import { GraduationCap, Presentation } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@devfellowship/components';
import { useI18n } from '@/i18n';
import type { LiveEntryRole } from '@/utils/liveEntryRole';

/**
 * "Entrar como aluno ou como professor?" — a bifurcação que só um admin vê.
 *
 * Usa o Dialog do `@devfellowship/components` (Radix) porque ele já traz o
 * focus trap e a devolução do foco ao fechar; um modal caseiro aqui seria um
 * segundo padrão de acessibilidade para manter.
 *
 * Fechar no X/Esc entra como ALUNO: é o comportamento que a rota já tinha antes
 * desta escolha existir, então dispensar a pergunta não pode virar tela morta.
 */
export function LiveEntryRoleModal({ onChoose }: { onChoose: (role: LiveEntryRole) => void }) {
  const { t } = useI18n();

  return (
    <Dialog open onOpenChange={(open) => !open && onChoose('learner')}>
      <DialogContent className="sm:max-w-md" data-testid="live-entry-role-modal">
        <DialogHeader>
          <DialogTitle>{t('live.entry.title')}</DialogTitle>
          <DialogDescription>{t('live.entry.body')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChoose('learner')}
            data-testid="live-entry-as-learner"
            className="flex flex-col items-start gap-1.5 rounded-2xl border border-border bg-card p-4 text-left hover:border-menta/60 transition-colors"
          >
            <GraduationCap className="w-5 h-5 text-menta" />
            <span className="text-sm font-medium text-foreground">{t('live.entry.learner')}</span>
            <span className="text-xs text-muted-foreground">{t('live.entry.learnerHint')}</span>
          </button>
          <button
            type="button"
            onClick={() => onChoose('instructor')}
            data-testid="live-entry-as-instructor"
            className="flex flex-col items-start gap-1.5 rounded-2xl border border-evergreen/40 bg-evergreen-soft p-4 text-left hover:border-evergreen transition-colors"
          >
            <Presentation className="w-5 h-5 text-evergreen-hi" />
            <span className="text-sm font-medium text-foreground">{t('live.entry.instructor')}</span>
            <span className="text-xs text-muted-foreground">{t('live.entry.instructorHint')}</span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground">{t('live.entry.switchHint')}</p>
      </DialogContent>
    </Dialog>
  );
}
