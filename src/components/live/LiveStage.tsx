import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { LiveAvatar } from '@/components/live/LiveAvatar';
import { LiveStageBody } from '@/components/live/LiveStageBody';
import { isByocActivity } from '@/components/branded/activity/byoc/byocSpec';
import type { Activity } from '@/types/content';
import type { StageCursor, StagedAnswer } from '@/types/liveClass';
import { transitionKindOf } from '@iterahq/activities';

interface LiveStageProps {
  staged: StagedAnswer;
  /**
   * The activity currently on the class. Shown read-only when the learner has
   * nothing local to project: `gatherStageContent` only sees a code source or a
   * submitted answer, so every other kind reports `empty` even while the learner
   * is working it. Pulling someone means showing the CURRENT state.
   *
   * Both surfaces pass it. The learner one used not to, on the grounds that it
   * already has its own copy below the stage — but that copy is not what the
   * professor pointed at, so without the mirror the whole class read the empty
   * state as the projection being broken.
   */
  activity?: Activity | null;
  /** Instructor-only affordance to dismiss the stage for everyone. */
  onClear?: () => void;
  /**
   * Instructor view mode (B9): the professor's own screen is REPLACED by the
   * pulled learner's, so the eyebrow reads "você está visualizando a tela de"
   * instead of the class-facing "no palco".
   */
  viewingName?: string;
  /**
   * Latest mirrored pointer/caret of the person on stage — the whole point of
   * the stage for a code exercise: without it, "move o cursor pra direita" has
   * no shared referent.
   */
  cursor?: StageCursor | null;
  /** Sample gap the cursor is arriving at; tunes the interpolation only. */
  cursorIntervalMs?: number;
  /**
   * The room is too large to mirror a cursor within the project's Realtime
   * budget. Shown, not hidden: silence would read as "the feature is broken".
   */
  cursorOff?: boolean;
  /**
   * Superfície do ALUNO: ele tem a própria atividade logo abaixo. Sem teto, um
   * `code` no palco ocupa a viewport inteira e "Sua atividade" some abaixo da
   * dobra — na aula de 17/08 a turma parou de responder porque não achava a
   * própria caixa. Com teto o palco rola por dentro e a fronteira fica visível.
   */
  capped?: boolean;
}

/**
 * The shared "on stage" surface (ADR-3/4): an identity bar naming the author
 * (NOT anonymous — the whole class sees whose work it is) plus the staged work.
 * `code` shows a read-only Monaco + the SAME sandboxed live preview the learner
 * sees; other kinds show a design-system summary card. Rendered by both the
 * learner and instructor pages directly below the navbar.
 *
 * Since the professor can now pull WORK IN PROGRESS (ADR-4 revised), the identity
 * bar carries an explicit "em andamento" badge: a classmate's half-written draft
 * on the projector must never be read by the class as a finished answer.
 */
export function LiveStage({
  staged,
  activity,
  onClear,
  viewingName,
  cursor = null,
  cursorIntervalMs = 200,
  cursorOff = false,
  capped = false,
}: LiveStageProps) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const isDraft = staged.status === 'in_progress';
  // O aluno abriu o exercício e não tem trabalho nele: o palco projeta o starter
  // (ou o terminal recém-aberto), e sem selo a turma leria aquilo como resposta
  // dele. O selo fala da TELA ("sem edições"), não da pessoa — a turma inteira
  // está vendo.
  const hasOwnScreen =
    staged.kind === 'code' || staged.kind === 'terminal' || staged.kind === 'chat';
  const isUntouched = hasOwnScreen && staged.status === 'not_started';
  // Nada DO ALUNO pra projetar, e por isso o palco cai no espelho da atividade.
  // Uma tela própria intocada não entra aqui: ela tem o que mostrar.
  const noLearnerWork =
    !isUntouched && (staged.kind === 'empty' || staged.status === 'not_started');
  // ⚠️ MONTAR O RENDERER NÃO É ESPELHAR — a regra que este `null` codifica.
  //
  // Estes são os kinds que reconstroem a tela a partir do ESTADO LOCAL de quem
  // renderiza: o editor semeia do storage do espectador, `useTerminalSandbox`
  // semeia um `initialTerminalModel` limpo, e `useSandboxScenario` semeia um
  // `initialModel` — a saudação autorada e mais nada. Espelhar a atividade neles
  // projeta a tela do PROFESSOR com o nome do ALUNO em cima.
  //
  // No `code` isso sempre foi barrado. No terminal não era, e o defeito ficou
  // invisível justamente porque o resultado PARECE um terminal funcionando — só
  // que vazio, o que a sala lê como "o aluno não fez nada" (Tainan, TG
  // 2026-08-10). No chat era idêntico, e ainda mais difícil de ver: uma janela
  // de chat com uma saudação dentro parece um chat funcionando. Os três passaram
  // a ter a mesma trava.
  //
  // O espelho entra pelo KIND DA ROW, não pelo `spec.sandboxKind` deprecado: os
  // dois sandboxes semeiam do cliente de quem assiste, então o discriminador de
  // spec não é consultado em lugar nenhum aqui.
  //
  // O enunciado não se perde: ele viaja DENTRO da tela espelhada
  // (`terminal.stepPrompt` / `chat.stepPrompt`), vindo do cliente do aluno, que é
  // a única fonte que sabe em que passo ele está.
  //
  // O BYOC não é kind, é camada, e cai na mesma regra por um caminho próprio:
  // `useByoc` BUSCA a árvore na montagem, então cada espectador geraria a dele e
  // veria uma atividade diferente com o nome do mesmo aluno em cima.
  // `transitionKindOf` folds the one-behaviour kinds (`code_fill_bank`,
  // `terminal_pick_command`, …) onto the old kind whose screen they reuse.
  const viewerStateKind = activity ? transitionKindOf(activity.kind) : null;
  const mirrorsFromViewerState =
    viewerStateKind === 'code' ||
    viewerStateKind === 'terminal_sandbox' ||
    viewerStateKind === 'chat_sandbox' ||
    (!!activity && isByocActivity(activity));
  const mirrorActivity = activity && !mirrorsFromViewerState ? activity : null;

  return (
    <div data-testid="live-stage">
      <div
        className="flex items-center gap-3 px-4 md:px-8 py-3 border-b border-streak/40 bg-streak/10"
        data-testid="live-stage-identity"
      >
        <LiveAvatar name={staged.author.name} avatarUrl={staged.author.avatarUrl} size="w-8 h-8" />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-mono text-streak leading-none">
            {viewingName ? t('live.stage.viewing') : t('live.stage.onStage')}
          </p>
          <div className="flex items-center gap-2 mt-0.5 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{staged.author.name}</p>
            {(isDraft || isUntouched || (noLearnerWork && mirrorActivity)) && (
              <span
                data-testid="live-stage-status"
                className="shrink-0 inline-flex items-center gap-1 h-5 px-2 rounded-full border border-streak/50 bg-streak/15 text-[10px] font-medium uppercase tracking-wide text-streak"
              >
                <Pencil className="w-2.5 h-2.5" />
                {t(
                  isDraft
                    ? 'live.stage.status.inProgress'
                    : isUntouched
                      ? 'live.stage.status.untouched'
                      : 'live.stage.status.current',
                )}
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {capped && (
            <button
              type="button"
              onClick={() => setCollapsed((open) => !open)}
              data-testid="live-stage-collapse"
              aria-expanded={!collapsed}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-streak/50 transition-colors"
            >
              {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
              {t(collapsed ? 'live.stage.expand' : 'live.stage.collapse')}
            </button>
          )}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              data-testid="live-stage-clear"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-border bg-background text-sm font-medium text-foreground hover:border-streak/50 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> {t('live.stage.clear')}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div
          className={`px-4 md:px-8 py-6 bg-muted/40 bg-linear-to-b/srgb from-streak/8 to-transparent ${
            capped ? 'max-h-[52dvh] overflow-y-auto' : ''
          }`}
          data-testid="live-stage-body"
          data-capped={capped ? 'true' : 'false'}
        >
          <LiveStageBody
            staged={staged}
            mirrorActivity={mirrorActivity}
            cursor={cursor}
            cursorIntervalMs={cursorIntervalMs}
            cursorOff={cursorOff}
          />
        </div>
      )}
    </div>
  );
}
