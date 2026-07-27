import type { Meta, StoryObj } from '@storybook/react';
import { ByocSeedForm } from '@/components/branded/activity/byoc/ByocSeedForm';
import { BYOC_SEED_COLLECTION } from './byocFixtures';
import { withActivityWidth } from './decorators';

/**
 * BYOC — PASSO 1: o aluno escreve o próprio contexto.
 *
 * O que ele digita aqui (a "seed") é o que a itera-api usa pra gerar a
 * atividade. Um tema recusado NÃO é acusação: volta como o convite do servidor
 * pra escolher outro, sem dizer o que barrou — o aluno é adolescente iniciante.
 */
const meta: Meta<typeof ByocSeedForm> = {
  title: 'Organisms/Activities/6 · Cenário com IA/BYOC · seu contexto',
  id: 'activities-ia-byoc-seed',
  component: ByocSeedForm,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof ByocSeedForm>;

export const Default: Story = {
  render: () => <ByocSeedForm seed={BYOC_SEED_COLLECTION} onSubmit={() => {}} />,
};

/** Tema recusado — o convite do servidor pra tentar outro. */
export const Refused: Story = {
  render: () => (
    <ByocSeedForm
      seed={BYOC_SEED_COLLECTION}
      error="Vamos escolher outro tema para essa atividade? Conte algo que você gosta de fazer — um esporte, uma música, um jogo, uma comida, um lugar que você curte."
      onSubmit={() => {}}
    />
  ),
};

/** Gerando — o formulário fica travado enquanto o modelo responde. */
export const Generating: Story = {
  render: () => <ByocSeedForm seed={BYOC_SEED_COLLECTION} disabled onSubmit={() => {}} />,
};
