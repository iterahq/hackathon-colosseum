import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveAnnotationToolbar } from '@/components/live/LiveAnnotationToolbar';
import type { AnnotationColor, AnnotationTool } from '@/types/liveAnnotation';

/**
 * LiveAnnotationToolbar — a caneta do professor sobre o palco.
 *
 * Aparece só no cliente do professor, e só enquanto há trabalho de OUTRA pessoa
 * no palco: o traço explica algo que está na tela. São três gestos e eles não se
 * confundem — a CANETA escreve, a BORRACHA tira o traço que saiu torto, e LIMPAR
 * varre o quadro inteiro. Nenhum é obrigatório: tudo some sozinho segundos depois
 * que a caneta levanta.
 */
const meta: Meta<typeof LiveAnnotationToolbar> = {
  title: 'Molecules/Live/LiveAnnotationToolbar',
  component: LiveAnnotationToolbar,
  parameters: { layout: 'centered' },
  args: { onTool: () => {}, onColor: () => {}, onClear: () => {} },
};
export default meta;
type Story = StoryObj<typeof LiveAnnotationToolbar>;

/** Mão livre: nada do que o professor faz com o ponteiro vira traço. */
export const Idle: Story = { args: { tool: null, color: 'menta' } };

/** Caneta. Enquanto está assim, o cursor do professor sai do fio. */
export const Pen: Story = { args: { tool: 'pen', color: 'menta' } };

/** Borracha: encostar num traço tira ele inteiro, para todo mundo. */
export const EraserOn: Story = { args: { tool: 'eraser', color: 'menta' } };

/** As três pontas se distinguem sobre código escuro — é o critério da paleta. */
export const Clay: Story = { args: { tool: 'pen', color: 'clay' } };
export const Azul: Story = { args: { tool: 'pen', color: 'azul' } };

function LiveToolbar() {
  const [tool, setTool] = useState<AnnotationTool | null>(null);
  const [color, setColor] = useState<AnnotationColor>('menta');
  return (
    <LiveAnnotationToolbar
      tool={tool}
      color={color}
      onTool={setTool}
      onColor={setColor}
      onClear={() => {}}
    />
  );
}

/** Interativa: escolher uma cor pega a CANETA, porque foi o gesto de quem escolheu. */
export const Interactive: Story = { render: () => <LiveToolbar /> };
