/**
 * Design Playground — Palco + Bloco de Código.
 *
 * A tela que o aluno vê quando o professor puxa o trabalho de um colega pro
 * PALCO enquanto a turma está no meio de um BLOCO DE CÓDIGO. As duas
 * experiências acontecem juntas na aula ao vivo e nunca tinham sido montadas
 * lado a lado num lugar iterável — é isso que este lab faz.
 *
 * Tudo aqui é o componente REAL de produção (`LiveStage`, `CodeSnackActivity`,
 * `LiveSidebar`, o chrome do topo), montado numa sala simulada: o Monaco é o
 * Monaco de verdade, o preview roda no mesmo iframe sandbox do app e o palco
 * mostra o código do colega em tempo real. Mexer nos controles muda a cena, não
 * um mock estático.
 *
 * Playground-only: nada aqui altera os componentes de produção.
 */
import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { CodeSpec } from '@iterahq/activity-spec';
import { LiveSessionChrome } from '@/components/live/LiveSessionChrome';
import { LiveHandButton } from '@/components/live/LiveHandButton';
import { LiveStage } from '@/components/live/LiveStage';
import { LiveSidebar } from '@/components/live/LiveSidebar';
import { CodeSnackActivity } from '@/components/branded/activity/code/CodeSnackActivity';
import { buildLiveRoomRows } from '@/utils/liveRoomRows';
import { CODE_SPEC, CODE_STARTER } from '@/stories/contractFixtures';
import type { Activity } from '@/types/content';
import type {
  ClassAnswerer,
  ClassPresenceMember,
  ClassRanking,
  StageWorkStatus,
} from '@/types/liveClass';

/* ──────────────────────────────── Sala simulada ─────────────────────────── */

const ACTIVITY_ID = 'act-code-lab';
const SELF_ID = 'u-ana';

const ROSTER: ClassPresenceMember[] = [
  { userId: 'prof', name: 'Prof. Tainan', avatarUrl: null, isInstructor: true },
  { userId: SELF_ID, name: 'Ana Souza', avatarUrl: null, workingOn: ACTIVITY_ID },
  { userId: 'u-bruno', name: 'Bruno Lima', avatarUrl: null, workingOn: ACTIVITY_ID },
  { userId: 'u-caio', name: 'Caio Mendes', avatarUrl: null, handRaised: true },
  { userId: 'u-duda', name: 'Duda Rocha', avatarUrl: null },
  { userId: 'u-elisa', name: 'Elisa Prado', avatarUrl: null, isGuest: true },
];

const ANSWERERS: ClassAnswerer[] = [
  { userId: 'u-duda', name: 'Duda Rocha', avatarUrl: null, state: 'done', elapsedMs: 34_000 },
  { userId: 'u-caio', name: 'Caio Mendes', avatarUrl: null, state: 'wrong', elapsedMs: 51_000 },
  { userId: SELF_ID, name: 'Ana Souza', avatarUrl: null, state: 'pending' },
  { userId: 'u-bruno', name: 'Bruno Lima', avatarUrl: null, state: 'pending' },
  { userId: 'u-elisa', name: 'Elisa Prado', avatarUrl: null, state: 'pending' },
];

const RANKING: ClassRanking = {
  ranked: [
    { userId: 'u-duda', name: 'Duda Rocha', avatarUrl: null, rank: 1, correctCount: 4, answeredCount: 4 },
    { userId: SELF_ID, name: 'Ana Souza', avatarUrl: null, rank: 2, correctCount: 3, answeredCount: 4 },
    { userId: 'u-bruno', name: 'Bruno Lima', avatarUrl: null, rank: 3, correctCount: 2, answeredCount: 4 },
    { userId: 'u-caio', name: 'Caio Mendes', avatarUrl: null, rank: 4, correctCount: 1, answeredCount: 4 },
  ],
  waiting: [{ userId: 'u-elisa', name: 'Elisa Prado', avatarUrl: null, isGuest: true }],
};

/** O rascunho do Bruno — é ISSO que aparece no palco quando o professor puxa. */
const PEER_DRAFT = CODE_STARTER.replace(
  'bg-emerald-600',
  'bg-fuchsia-600',
).replace('Gostei: {curtidas}', 'Curti muito: {curtidas}');

const CHECKS: NonNullable<CodeSpec['checks']> = [
  {
    id: 'botao-outra-cor',
    label: 'O botão mudou de cor',
    hint: 'No className do botão, troque bg-emerald-600 por outra cor do Tailwind.',
    selector: 'button',
    assert: { type: 'class', contains: 'bg-sky-600' },
  },
  {
    id: 'botao-outro-texto',
    label: 'O texto do botão mudou',
    hint: 'O texto fica entre > e </button> — escreva o que você quiser ali.',
    selector: 'button',
    assert: { type: 'text', contains: 'Curti' },
  },
];

function makeActivity(withChecks: boolean): Activity {
  return {
    id: withChecks ? `${ACTIVITY_ID}-checks` : ACTIVITY_ID,
    lessonId: 'lesson-lab',
    ordinal: 3,
    kind: 'code',
    spec: withChecks ? { ...CODE_SPEC, checks: CHECKS } : CODE_SPEC,
    rubric: null,
    status: 'in_progress',
  };
}

/* ─────────────────────────────────── Controles ───────────────────────────── */

type StageMode = 'off' | StageWorkStatus;

const STAGE_MODES: { id: StageMode; label: string }[] = [
  { id: 'off', label: 'Sem palco' },
  { id: 'in_progress', label: 'Rascunho do colega' },
  { id: 'submitted', label: 'Trabalho enviado' },
  { id: 'not_started', label: 'Não começou' },
];

function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
        {label}
      </span>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`inline-flex items-center h-9 px-3.5 rounded-full border text-sm transition-colors ${
            o.id === value
              ? 'border-evergreen bg-evergreen-soft text-evergreen-hi'
              : 'border-border bg-card text-foreground hover:border-evergreen/40'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ──────────────────────────────────── Cena ──────────────────────────────── */

function StageCodeScene({
  role,
  stageMode,
  withChecks,
  onClearStage,
}: {
  role: 'learner' | 'instructor';
  stageMode: StageMode;
  withChecks: boolean;
  onClearStage: () => void;
}) {
  const [handRaised, setHandRaised] = useState(false);
  const isInstructor = role === 'instructor';
  const activity = useMemo(() => makeActivity(withChecks), [withChecks]);

  const rows = useMemo(
    () =>
      buildLiveRoomRows({
        ranking: RANKING,
        answerers: ANSWERERS,
        roster: ROSTER,
        currentActivityId: ACTIVITY_ID,
        selfUserId: isInstructor ? undefined : SELF_ID,
      }),
    [isInstructor],
  );

  const staged =
    stageMode === 'off'
      ? null
      : {
          activityId: ACTIVITY_ID,
          kind: 'code',
          content: stageMode === 'not_started' ? '' : PEER_DRAFT,
          status: stageMode,
          author: { userId: 'u-bruno', name: 'Bruno Lima', avatarUrl: null },
        };

  return (
    <div className="flex flex-col min-h-full bg-background">
      <LiveSessionChrome
        progressPct={45}
        connected
        presenceCount={ROSTER.length}
        ended={false}
        activityIndex={2}
        activityCount={5}
        handSlot={
          isInstructor ? undefined : (
            <LiveHandButton raised={handRaised} onToggle={() => setHandRaised((r) => !r)} />
          )
        }
        onClose={() => {}}
      />

      {staged && (
        <LiveStage
          staged={staged}
          onClear={isInstructor ? onClearStage : undefined}
          viewingName={isInstructor ? staged.author.name : undefined}
        />
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <main className="flex-1 min-h-0 px-4 md:px-8 lg:overflow-y-auto pt-10 md:pt-14 pb-8">
          <div className="mx-auto w-full max-w-4xl">
            <CodeSnackActivity activity={activity} onComplete={() => {}} live />
          </div>
        </main>

        <LiveSidebar
          role={role}
          roster={ROSTER}
          answerers={ANSWERERS}
          rows={rows}
          hasActivity
          kind="code"
          activityIndex={2}
          activityCount={5}
          stagedAuthor={staged?.author ?? null}
          onToggleStage={isInstructor ? onClearStage : undefined}
        />
      </div>
    </div>
  );
}

function StageCodeLab() {
  const [role, setRole] = useState<'learner' | 'instructor'>('learner');
  const [stageMode, setStageMode] = useState<StageMode>('in_progress');
  const [withChecks, setWithChecks] = useState<'sim' | 'nao'>('nao');

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1400px] mx-auto space-y-5">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi">
            Design Playground
          </p>
          <h1 className="font-display font-bold text-2xl text-foreground mt-1">
            Palco + Bloco de Código
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            O aluno está resolvendo o bloco de código enquanto o trabalho de um colega está no palco.
            Os componentes são os de produção: o editor é o Monaco, o preview roda no iframe sandbox e
            o palco mostra o rascunho do colega. Edite o código à esquerda — o preview responde.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Chips
            label="Quem vê"
            value={role}
            onChange={setRole}
            options={[
              { id: 'learner', label: 'Aluno' },
              { id: 'instructor', label: 'Professor' },
            ]}
          />
          <Chips label="Palco" value={stageMode} onChange={setStageMode} options={STAGE_MODES} />
          <Chips
            label="Verificações"
            value={withChecks}
            onChange={setWithChecks}
            options={[
              { id: 'nao', label: 'Sem checks' },
              { id: 'sim', label: 'Com checks' },
            ]}
          />
        </div>

        <div className="rounded-2xl border border-border overflow-hidden">
          <StageCodeScene
            key={`${role}-${withChecks}`}
            role={role}
            stageMode={stageMode}
            withChecks={withChecks === 'sim'}
            onClearStage={() => setStageMode('off')}
          />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────── Meta ─────────────────────────────────── */

const meta: Meta = {
  // Fixo, porque o slug automático do título acentuado gera um id com "ó" — link
  // do Storybook quebra ao ser colado fora do app.
  id: 'design-playground-palco-bloco-de-codigo',
  title: 'Design Playground/Palco + Bloco de Código',
  parameters: { layout: 'fullscreen', controls: { disable: true } },
};
export default meta;

export const PalcoEBlocoDeCodigo: StoryObj = {
  name: 'Aluno no palco · bloco de código',
  render: () => <StageCodeLab />,
};
