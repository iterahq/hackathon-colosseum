import type { Meta, StoryObj } from '@storybook/react-vite';
import { LiveContentDiagnostic } from '@/components/live/LiveContentDiagnostic';

/**
 * LiveContentDiagnostic — o que aparece no lugar do skeleton quando a espera do
 * aluno não anda mais.
 *
 * Cada story é uma causa REAL de tela parada. O painel existe porque, sem ele,
 * as quatro se pareciam exatamente com "carregando": o aluno saía e voltava, e
 * o professor não tinha o que perguntar além de "não carrega pra você também?".
 */
const meta: Meta<typeof LiveContentDiagnostic> = {
  title: 'Organisms/Live/LiveContentDiagnostic',
  component: LiveContentDiagnostic,
  parameters: { layout: 'centered' },
  args: {
    detail: [
      'session    sess-9f2a',
      'lesson     83aaee00-1d1f-4a2b-9c31-6a0f9f2e77bd',
      'guest      —',
      'pointer    11111111-1111-1111-1111-111111111111',
      'activities 0',
      'query      success/idle',
    ],
    onRetry: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof LiveContentDiagnostic>;

/** A sessão não aponta para lição nenhuma — a leitura nem chega a sair. */
export const SemLicao: Story = { args: { fault: 'no-lesson' } };

/** A leitura terminou em erro; a mensagem do banco vai junto. */
export const LeituraFalhou: Story = {
  args: {
    fault: 'load-failed',
    detail: [
      'session    sess-9f2a',
      'lesson     83aaee00-1d1f-4a2b-9c31-6a0f9f2e77bd',
      'guest      TPYC7BTN',
      'pointer    11111111-1111-1111-1111-111111111111',
      'activities 0',
      'query      error/idle',
      'error      permission denied for table lessons',
    ],
  },
};

/** O ponteiro do professor caiu fora desta lição. */
export const AtividadeForaDaLicao: Story = { args: { fault: 'activity-missing' } };

/** Nada resolveu dentro do orçamento — causa desconhecida, tela explicada. */
export const Travado: Story = { args: { fault: 'stalled' } };
