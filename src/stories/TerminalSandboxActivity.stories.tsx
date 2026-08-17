import type { Meta, StoryObj } from '@storybook/react';
import { TerminalSandboxActivity } from '@/components/branded/activity/TerminalSandboxActivity';
import scenarios from '@/test/fixtures/terminal-scenarios.json';
import { makeActivity, noop } from './activityFixtures';
import { withActivityWidth } from './decorators';

/**
 * CONTRATO `terminal_sandbox`.
 *
 * O irmão do sandbox de chat, com outro `initialState` e outro modelo de mundo
 * (plano `20260806-itera-terminal-sandbox-activity`, ADR-1).
 *
 * São DUAS activities que diferem só pelo modo de input (`spec.inputMode`), e
 * as duas passam pelo MESMO matcher: o modo de opções apenas fecha o espaço de
 * entrada antes de o matcher rodar, e não tem noção própria de "certo".
 *
 * Runtime 100% determinístico — sem rede, sem LLM. Dá pra jogar do início ao
 * fim no canvas, inclusive errando: comando errado EXECUTA, imprime o erro do
 * engine e simplesmente não acende o passo.
 *
 * As fixtures são a cópia local do corpus de conformidade do pacote
 * (`activity-spec:src/schemas/fixtures/terminal-scenarios.ts`), onde a CI
 * replaya cada `masterLine`. Mesma convenção do sandbox de chat, que também
 * mantém `sandbox-scenarios.json` aqui: fixture não vai no bundle de runtime.
 */
const bySlug = scenarios as unknown as Record<string, Record<string, unknown>>;

const meta: Meta<typeof TerminalSandboxActivity> = {
  title: 'Organisms/Activities/8 · Sandbox de terminal',
  id: 'activities-sandbox-terminal',
  component: TerminalSandboxActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof TerminalSandboxActivity>;

/**
 * t1 — texto livre, um comando por passo. `git checkout -b feat/perfil` e
 * depois `git status`. Aceita `git switch -c feat/perfil` porque a equivalência
 * está AUTORADA em `accept[]`, não inferida por esperteza do normalizador.
 */
export const FreeTextSingleCommand: Story = {
  render: () => (
    <TerminalSandboxActivity
      activity={makeActivity('terminal_sandbox', bySlug.t1!)}
      onComplete={noop}
    />
  ),
};

/**
 * t2 — o caminho MULTI-COMANDO ORDENADO, que é o que um cenário de um comando
 * só nunca exercita. O último passo é `commandSequence { ordered: true }`:
 * commitar antes de preparar roda, imprime o erro do engine, e não acende.
 */
export const FreeTextOrderedSequence: Story = {
  render: () => (
    <TerminalSandboxActivity
      activity={makeActivity('terminal_sandbox', bySlug.t2!)}
      onComplete={noop}
    />
  ),
};

/**
 * t3 — o MESMO julgamento do t1, com opções embaixo da tela. Granularidade por
 * PASSO: passo 1 dá comandos inteiros com distratores (reconhecimento), passo 2
 * dá tokens soltos pra montar a linha (produção). Os `unlock` são idênticos aos
 * do t1.
 */
export const OptionsCommandThenTokens: Story = {
  render: () => (
    <TerminalSandboxActivity
      activity={makeActivity('terminal_sandbox', bySlug.t3!)}
      onComplete={noop}
    />
  ),
};

/**
 * t4 — `engine: "none"`. Um terminal SEM modelo de mundo nenhum: `ls`,
 * `npm install`, `npm test`, com saída inteiramente autorada. É a prova viva de
 * que "terminal em geral" é o caso de primeira classe e não git com
 * escapatórias — zero linha de simulador.
 */
export const EnginelessGenericTerminal: Story = {
  render: () => (
    <TerminalSandboxActivity
      activity={makeActivity('terminal_sandbox', bySlug.t4!)}
      onComplete={noop}
    />
  ),
};

/** Reveal ao vivo — o recap + a masterLine, sem o aluno ter rodado nada. */
export const RevealedInLive: Story = {
  render: () => (
    <TerminalSandboxActivity
      activity={makeActivity('terminal_sandbox', bySlug.t1!)}
      onComplete={noop}
      reveal
    />
  ),
};
