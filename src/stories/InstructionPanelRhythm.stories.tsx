import type { Meta, StoryObj } from '@storybook/react';
import { InstructionPanel } from '@/components/branded/activity/InstructionPanel';
import {
  FLAT_GIT,
  LIVE_CONCEPT,
  REVEAL_ONLY,
  RHYTHM_GIT,
  STEPPED_CONCEPT,
  VOCABULARY,
} from '@/stories/rhythmFixtures';

/**
 * A camada de ritmo: `---` corta o conceito em passos e `?>`/`?=` pede que o
 * aluno responda na cabeça antes de ver a resposta. Ao vivo tudo vem aberto —
 * quem dita o ritmo lá é o professor falando.
 *
 * O passo é opt-in (`stepped`): sem a prop nenhum kind ganha passo, nem com
 * `---` no texto. Enunciado de quiz cronometrado não pode esconder metade da
 * pergunta atrás de um botão.
 */
const meta: Meta<typeof InstructionPanel> = {
  title: 'Molecules/InstructionPanel/Ritmo',
  component: InstructionPanel,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof InstructionPanel>;

const wrap = { maxWidth: 560 } as const;

function Coluna({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="mb-3">
        <div className="font-mono text-[11px] uppercase tracking-wider text-evergreen-hi">{titulo}</div>
        <div className="text-xs text-muted-foreground">{nota}</div>
      </div>
      <div className="rounded-2xl border border-border bg-obsidiana/40 p-5">{children}</div>
    </div>
  );
}

/** O texto real da aula de Git do Educar+, antes e depois da camada. */
export const AntesEDepois: Story = {
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex max-w-5xl flex-col gap-6 lg:flex-row">
      <Coluna titulo="Sem ritmo" nota="Tudo de uma vez — o aluno decide sozinho onde parar">
        <InstructionPanel spec={{ text: FLAT_GIT }} />
      </Coluna>
      <Coluna titulo="Com ritmo" nota="Mesmo texto + --- e ?> ?=">
        <InstructionPanel spec={{ text: RHYTHM_GIT }} stepped />
      </Coluna>
    </div>
  ),
};

/** `---` corta em passos: um pedaço por vez, com contador e "Continuar lendo". */
export const Passos: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ text: STEPPED_CONCEPT }} stepped />
    </div>
  ),
};

/** `?>`/`?=` sozinho: pensar antes de ver, sem cortar o texto em passos. */
export const PenseAntes: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ text: REVEAL_ONLY }} stepped />
    </div>
  ),
};

/** Ao vivo o professor dita o ritmo: passos e respostas já abertos. */
export const AoVivo: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ text: LIVE_CONCEPT }} />
    </div>
  ),
};

/** Sem `stepped` o mesmo texto sai inteiro — o `---` vira só uma quebra. */
export const SemStepped: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ text: STEPPED_CONCEPT }} />
    </div>
  ),
};

/** Todos os blocos que o parser conhece, num texto só. */
export const Vocabulario: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel spec={{ text: VOCABULARY }} stepped />
    </div>
  ),
};

/** A descrição é secundária e não ganha passo — só o texto principal ganha. */
export const ComDescricao: Story = {
  render: () => (
    <div style={wrap}>
      <InstructionPanel
        spec={{ text: STEPPED_CONCEPT, description: 'Depois disto vem o exercício de props.' }}
        stepped
      />
    </div>
  ),
};
