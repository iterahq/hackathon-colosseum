import type { Meta, StoryObj } from '@storybook/react';
import { JudgeHeatmap } from '@/components/branded/activity/JudgeHeatmap';
import type { JudgeVerdict } from '@/api/iteraApi';

/**
 * Live AI-judge verdicts captured from the real E2E (free model
 * openai/gpt-oss-20b:free) against the course #1 data-spec.md activity. GOOD
 * data-spec -> 90 (3/3 PASS); WEAK/denormalized -> 20 (normalization FAIL'd).
 */
const meta: Meta<typeof JudgeHeatmap> = {
  title: 'Activity/JudgeHeatmap',
  component: JudgeHeatmap,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
};
export default meta;
type Story = StoryObj<typeof JudgeHeatmap>;

const GOOD: JudgeVerdict = {
  result_id: 'good-1',
  activity_id: '18adeaf3-dc2e-4d5d-8afa-d5b14dae5068',
  attempt: 1,
  status: 'passed',
  passed: true,
  score: 90,
  feedback:
    'Parabéns! Você listou três correções concretas e demonstrou entendimento de normalização. A especificação está clara e atende ao que foi pedido.',
  criteria: [
    { criterion: 'Lista ≥3 correções concretas ao modelo da IA', met: true, note: 'Listou exatamente três correções concretas.' },
    { criterion: 'Demonstra entendimento de normalização (FK vs cópia)', met: true, note: 'Explicou a diferença entre copiar dados e usar chaves estrangeiras.' },
    { criterion: 'Clareza da especificação', met: true, note: 'Escreveu a estrutura das tabelas de forma compreensível.' },
  ],
  model: 'openai/gpt-oss-20b:free',
  progress_status: 'completed',
  judge_available: true,
};

const WEAK: JudgeVerdict = {
  result_id: 'weak-1',
  activity_id: '18adeaf3-dc2e-4d5d-8afa-d5b14dae5068',
  attempt: 1,
  status: 'failed',
  passed: false,
  score: 20,
  feedback:
    'Você não listou correções concretas nem demonstrou entendimento de normalização, além de não ter escrito um data-spec.md claro. Revise o modelo, identifique pelo menos três ajustes e explique por que os fez.',
  criteria: [
    { criterion: 'Lista ≥3 correções concretas ao modelo da IA', met: false, note: 'Nenhuma correção listada' },
    { criterion: 'Demonstra entendimento de normalização (FK vs cópia)', met: false, note: 'Modelo não segue boas práticas de normalização' },
    { criterion: 'Clareza da especificação', met: false, note: 'Especificação é vaga e não segue formato esperado' },
  ],
  model: 'openai/gpt-oss-20b:free',
  progress_status: 'in_progress',
  judge_available: true,
};

export const GoodSubmission: Story = { args: { verdict: GOOD } };
export const WeakDenormalized: Story = { args: { verdict: WEAK } };

/** Both side by side — the showcase: same activity, DIFFERENT sensible scores. */
export const GoodVsWeak: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', maxWidth: 920 }}>
      <div style={{ flex: '1 1 380px' }}>
        <h3 style={{ color: '#7CE0B3', fontFamily: 'monospace', marginBottom: 8 }}>GOOD data-spec</h3>
        <JudgeHeatmap verdict={GOOD} />
      </div>
      <div style={{ flex: '1 1 380px' }}>
        <h3 style={{ color: '#E08A6E', fontFamily: 'monospace', marginBottom: 8 }}>WEAK / denormalized</h3>
        <JudgeHeatmap verdict={WEAK} />
      </div>
    </div>
  ),
};
