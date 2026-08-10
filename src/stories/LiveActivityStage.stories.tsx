import type { Meta, StoryObj } from '@storybook/react';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import { learnerActivityGate } from '@/utils/liveActivityGate';
import type { ActivityKind } from '@/types/content';
import { makeActivity, noop } from './activityFixtures';
import { ACTIVITY_CONTRACTS, type ContractKey } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * EIXO A da matriz de estados — o GATE AO VIVO (`enabled` · `locked`).
 *
 * Até aqui **nenhuma story do repo renderizava o estado `locked`** (V6 do plano
 * `20260728-itera-activity-testing` — cobertura zero), e é o PRIMEIRO item da
 * lista que o Tainan enumerou ("resposta desabilitada").
 *
 * Por que a story é do `LiveActivityStage` e não de cada activity: `locked` NÃO
 * é prop de componente de activity. Ele é PRODUZIDO por
 * `learnerActivityGate({ timerRunning, expired, answered })` na
 * `src/pages/LiveSessionPage.tsx` e CONSUMIDO aqui, como a prop `readOnly` do
 * stage — que aplica `inert` (mata pointer/teclado e some da árvore de a11y) e
 * `select-none`. Renderizar "locked" dentro de um `SingleChoiceActivity`
 * inventaria um estado que a produção não tem.
 *
 * As stories abaixo passam pelo gate DE VERDADE (`expired: true, answered:
 * false` ⇒ `locked`), em vez de hard-codar `readOnly` — assim, se a regra do
 * gate mudar, a vitrine muda junto.
 *
 * Os specs vêm todos de `contractFixtures.ts` (fonte única, Zod-validada pelo
 * guard `src/test/activityContractFixtures.test.ts`).
 */
const meta: Meta<typeof LiveActivityStage> = {
  title: 'Organisms/Activities/8 · Gate ao vivo (locked)',
  id: 'activities-gate-locked',
  component: LiveActivityStage,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof LiveActivityStage>;

/** O gate real: relógio estourou sem resposta ⇒ `locked` ⇒ `readOnly`. */
const EXPIRED = learnerActivityGate({ timerRunning: false, expired: true, answered: false });
/** O contraste: activity recém-aberta ⇒ nada travado. */
const OPEN = learnerActivityGate({ timerRunning: true, expired: false, answered: false });

function stage(key: ContractKey, gate: { readOnly: boolean }): Story {
  const contract = ACTIVITY_CONTRACTS[key];
  return {
    render: () => (
      <LiveActivityStage
        activity={makeActivity(
          contract.kind as ActivityKind,
          contract.spec as Record<string, unknown>,
          undefined,
          (contract as { rubric?: Record<string, unknown> }).rubric ?? null,
        )}
        readOnly={gate.readOnly}
        onComplete={noop}
        testid="live-activity"
      />
    ),
  };
}

/* --- Referência: o MESMO stage sem o gate, para comparar lado a lado ------- */

/** `enabled` — o clock roda, o aluno pode responder. Contraste dos `Locked*`. */
export const EnabledSingleChoice: Story = stage('single_choice', OPEN);

/* --- `locked` por kind ---------------------------------------------------- */
/* Um por kind do enum `itera.activity_kind`, com o contrato representativo.   */

/** 1 · Exposição — concept travado: nem "concluir" fica clicável. */
export const LockedConcept: Story = stage('concept', EXPIRED);

/** 1 · Exposição — concept_reveal travado: nada a travar, quem abre é o professor. */
export const LockedConceptReveal: Story = stage('concept_reveal', EXPIRED);

/** 1 · Exposição — video travado. */
export const LockedVideo: Story = stage('video', EXPIRED);

/** 1 · Exposição — diagram travado. */
export const LockedDiagram: Story = stage('diagram', EXPIRED);

/** 1 · Exposição — document (leitura) travado. */
export const LockedDocumentLeitura: Story = stage('document_reading', EXPIRED);

/** 2 · Escolha — single_choice travado: as opções não recebem clique. */
export const LockedSingleChoice: Story = stage('single_choice', EXPIRED);

/** 2 · Escolha — multi_choice travado. */
export const LockedMultiChoice: Story = stage('multi_choice', EXPIRED);

/** 2 · Escolha — quiz travado (a activity "herói"). */
export const LockedQuiz: Story = stage('quiz', EXPIRED);

/** 3 · Associação — match travado: o drag não pega. */
export const LockedMatch: Story = stage('match', EXPIRED);

/** 4 · Ordenação — order travado. */
export const LockedOrder: Story = stage('order', EXPIRED);

/** 5 · Produção — document (redação) travado: o textarea não aceita foco. */
export const LockedDocumentRedacao: Story = stage('document_writing', EXPIRED);

/**
 * 5 · Produção — code travado. O lock é UNIVERSAL: `liveActivityGate` documenta
 * explicitamente que `code` também trava no "pens down" (Tainan 2026-07-23),
 * mesmo sem ter gabarito para revelar.
 */
export const LockedCode: Story = stage('code', EXPIRED);

/** 6 · Cenário com IA — sandbox_scenario travado. */
export const LockedSandboxScenario: Story = stage('sandbox_open', EXPIRED);

/** 6 · Cenário com IA — chat_sandbox travado: o lock não depende do kind. */
export const LockedChatSandbox: Story = stage('chat_sandbox', EXPIRED);

/** 6 · Cenário com IA — terminal_sandbox travado: o prompt não aceita comando. */
export const LockedTerminalSandbox: Story = stage('terminal_sandbox', EXPIRED);
