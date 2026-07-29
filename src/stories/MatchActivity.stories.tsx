import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { MatchActivity } from '@/components/branded/activity/MatchActivity';
import { makeActivity } from './activityFixtures';
import { MATCH_SPEC as SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { connectPair, connectPairs, submitAnswer } from './interactions';

/**
 * CONTRATO `match` — associação entre dois conjuntos.
 *
 *   { instruction?, left: [{ id, label? }], right: [{ id, label? }], pairs: [{ left_id, right_id }] }
 *
 * Contrato tipado: cada `pair` precisa referenciar um id existente em `left` e
 * em `right`. Função pedagógica própria (ligar, não escolher) → grupo próprio.
 *
 * ── FASE 3 (ADR-4) ─────────────────────────────────────────────────────────
 * `initialConnections`/`initialSubmitted` sumiram: cada par abaixo é formado
 * TOCANDO o card da esquerda e depois o da direita — o mecanismo real.
 *
 * ⚠️ CORREÇÃO DE GROUND TRUTH: o ADR-8 manda `match` para o browser mode "por
 * causa da geometria de drag do `@dnd-kit/react`". O componente NÃO usa
 * drag-and-drop nenhum — `@dnd-kit/react` está no `package.json` e não é
 * importado em lugar nenhum de `src/`. `match` é dois taps, e portanto é
 * inteiramente dirigível em jsdom, como estas stories provam.
 */
const meta: Meta<typeof MatchActivity> = {
  title: 'Organisms/Activities/3 · Associação/Match',
  id: 'activities-associacao-match',
  component: MatchActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof MatchActivity>;

const RIGHT_PAIRS: [string, string][] = [
  ['Chave primária', 'Identifica unicamente uma linha'],
  ['Chave estrangeira', 'Referencia a PK de outra tabela'],
  ['Índice', 'Acelera buscas por coluna'],
];
/** PK e FK trocadas — o erro clássico deste conteúdo. */
const WRONG_PAIRS: [string, string][] = [
  ['Chave primária', 'Referencia a PK de outra tabela'],
  ['Chave estrangeira', 'Identifica unicamente uma linha'],
  ['Índice', 'Acelera buscas por coluna'],
];

export const Default: Story = {
  args: { activity: makeActivity('match', SPEC) },
};

/**
 * C.answered — UM par formado. O "Enviar" segue travado de propósito: o
 * `match` só aceita submissão com a associação COMPLETA.
 */
export const PartiallyConnected: Story = {
  args: { activity: makeActivity('match', SPEC) },
  play: async ({ canvasElement }) => {
    await connectPair(canvasElement, ...RIGHT_PAIRS[0]);
    await expect(within(canvasElement).getAllByTestId('match-badge')).toHaveLength(2);
    await expect(within(canvasElement).getByTestId('match-submit')).toBeDisabled();
  },
};

/** C.submitted + D.correct — os três pares certos, enviados. */
export const Correct: Story = {
  args: { activity: makeActivity('match', SPEC) },
  play: async ({ args, canvasElement }) => {
    await connectPairs(canvasElement, RIGHT_PAIRS);
    await submitAnswer(canvasElement, 'match-submit');
    await expect(within(canvasElement).getByTestId('match-submit')).toHaveAttribute('data-correct', 'true');
    await expect(args.onComplete).toHaveBeenCalledWith(true, expect.anything());
  },
};

/** D.incorrect — PK e FK trocadas: as badges dos dois pares errados viram ✗. */
export const Incorrect: Story = {
  args: { activity: makeActivity('match', SPEC) },
  play: async ({ args, canvasElement }) => {
    await connectPairs(canvasElement, WRONG_PAIRS);
    await submitAnswer(canvasElement, 'match-submit');
    await expect(within(canvasElement).getByTestId('match-submit')).toHaveAttribute('data-correct', 'false');
    await expect(args.onComplete).toHaveBeenCalledWith(false, expect.anything());
  },
};

/** B.done — activity já concluída: os cards não recebem toque. */
export const Disabled: Story = {
  args: { activity: makeActivity('match', SPEC, 'done') },
};
