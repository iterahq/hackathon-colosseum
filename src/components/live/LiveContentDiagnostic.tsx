/**
 * Por que a tela do aluno não anda — no lugar do skeleton eterno.
 *
 * Numa aula ao vivo parte da turma ficou nos blocos cinza sem nenhum caminho de
 * volta: sair e entrar não muda nada (a causa não está na montagem), e o aluno
 * não tem o que dizer ao professor além de "não carrega". O skeleton é honesto
 * por alguns segundos e mentira depois disso.
 *
 * Três coisas, nessa ordem de utilidade: o NOME da falha em português, a linha
 * técnica que o aluno cola no chat da aula, e as duas saídas que de fato
 * existem — reler o conteúdo e recarregar a página. A linha técnica é `<pre>`
 * selecionável de propósito: é o "console log" que o professor pediu, e sem ela
 * o suporte volta a ser adivinhação.
 */
import { AlertTriangle, RefreshCw, RotateCw } from 'lucide-react';
import { useI18n } from '@/i18n';

export type LiveContentFault =
  /** A sessão não aponta para lição nenhuma — a leitura nem chega a sair. */
  | 'no-lesson'
  /** A leitura terminou em erro (rede, RLS, lição de outro tenant). */
  | 'load-failed'
  /** Lição legível, porém sem atividades. */
  | 'empty-lesson'
  /** O ponteiro do professor aponta para uma atividade fora desta lição. */
  | 'activity-missing'
  /** Nada resolveu dentro do orçamento de espera — a causa é desconhecida. */
  | 'stalled';

interface LiveContentDiagnosticProps {
  fault: LiveContentFault;
  /** Uma linha por fato — sessão, lição, ponteiro, erro. */
  detail: string[];
  onRetry: () => void;
}

export function LiveContentDiagnostic({ fault, detail, onRetry }: LiveContentDiagnosticProps) {
  const { t } = useI18n();

  return (
    <div
      className="mt-8 rounded-3xl border border-dashed border-clay/40 bg-clay/5 p-8 md:p-10"
      data-testid="live-unavailable"
      data-fault={fault}
    >
      <div className="flex flex-col items-center text-center">
        <AlertTriangle className="h-6 w-6 text-clay" />
        <p className="mt-3 font-display text-lg text-foreground">{t('live.unavailable.title')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t(`live.fault.${fault}`)}</p>
      </div>

      <pre
        className="mt-6 overflow-x-auto rounded-2xl border border-border bg-obsidiana/60 p-4 text-left font-mono text-xs leading-relaxed text-menta"
        data-testid="live-fault-detail"
      >
        {detail.join('\n')}
      </pre>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          data-testid="live-fault-retry"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-evergreen px-5 text-sm font-medium text-obsidiana transition-colors hover:bg-evergreen-hi"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('live.fault.retry')}
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          data-testid="live-fault-reload"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCw className="h-3.5 w-3.5" />
          {t('live.fault.reload')}
        </button>
      </div>
    </div>
  );
}
