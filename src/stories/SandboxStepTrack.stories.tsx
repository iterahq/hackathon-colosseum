import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SandboxStepHeader } from '@iterahq/activities';
import { Button } from '@devfellowship/components';
import { withActivityWidth } from './decorators';

/**
 * A TRILHA DE PASSOS — o cabeçalho acima da janela do sandbox (terminal e chat).
 *
 * O sandbox multi-passo era lido como UMA tarefa: o enunciado trocava no lugar,
 * sob um rótulo de 11px, e quem tinha acabado de digitar via texto novo e
 * achava que tinha lido errado o antigo. A trilha gasta o progresso que a tela
 * já tinha: quantos passos existem, quais foram vencidos, e que o texto MUDOU.
 *
 * As stories estáticas são os estados que o design precisa comparar lado a
 * lado; o flash de virada só existe na transição, então tem story própria com
 * botão. Sob `prefers-reduced-motion` tudo colapsa na figura estática — a
 * contagem e os segmentos preenchidos continuam lá.
 */
const meta: Meta<typeof SandboxStepHeader> = {
  title: 'Organisms/Activities/9 · Partes compartilhadas/Trilha de passos',
  id: 'activities-partes-trilha-passos',
  component: SandboxStepHeader,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof SandboxStepHeader>;

const HINT_LABEL = 'Dica';

/** Primeiro de três — nenhum segmento vencido, só o atual aceso. */
export const PrimeiroDeTres: Story = {
  render: () => (
    <SandboxStepHeader
      stepIdx={0}
      stepCount={3}
      prompt="Crie a branch `feat/perfil` e entre nela."
      hintLabel={HINT_LABEL}
    />
  ),
};

/** No meio — o segmento vencido fica esmaecido, o atual cheio. */
export const MeioDaTrilha: Story = {
  render: () => (
    <SandboxStepHeader
      stepIdx={1}
      stepCount={3}
      prompt="Veja o estado da árvore com `git status`."
      hintLabel={HINT_LABEL}
    />
  ),
};

/** Último passo, com dica autorada aberta embaixo do enunciado. */
export const UltimoPassoComDica: Story = {
  render: () => (
    <SandboxStepHeader
      stepIdx={2}
      stepCount={3}
      prompt="Registre o commit com uma mensagem que diga o que mudou."
      hint="A mensagem vai entre aspas, depois do `-m`."
      hintLabel={HINT_LABEL}
    />
  ),
};

/**
 * Um passo só — a trilha não é desenhada. Um trilho de segmento único não
 * informa nada e ainda sugere que faltam outros.
 */
export const PassoUnico: Story = {
  render: () => (
    <SandboxStepHeader
      stepIdx={0}
      stepCount={1}
      prompt="Rode os testes do projeto."
      hintLabel={HINT_LABEL}
    />
  ),
};

/** Trilha longa — oito passos, pra conferir os segmentos em largura apertada. */
export const TrilhaLonga: Story = {
  render: () => (
    <SandboxStepHeader
      stepIdx={4}
      stepCount={8}
      prompt="Suba a branch para o repositório remoto."
      hintLabel={HINT_LABEL}
    />
  ),
};

/**
 * O FLASH DE VIRADA. Só aparece quando o passo AVANÇA, e some sozinho em 2,6s —
 * é o objeto que o aluno pode perder e voltar pra ver. O botão faz o papel do
 * comando certo digitado no terminal.
 */
export const FlashDeVirada: Story = {
  render: function Render() {
    const [stepIdx, setStepIdx] = useState(0);
    const stepCount = 3;
    return (
      <div className="flex flex-col gap-4">
        <SandboxStepHeader
          stepIdx={stepIdx}
          stepCount={stepCount}
          prompt={`Enunciado do passo ${stepIdx + 1}.`}
          hintLabel={HINT_LABEL}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => setStepIdx((i) => Math.min(i + 1, stepCount - 1))}
            disabled={stepIdx === stepCount - 1}
          >
            Vencer o passo
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStepIdx(0)}>
            Reiniciar
          </Button>
        </div>
      </div>
    );
  },
};
