import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
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

/* ══════════════════════════════════════════════════════════════════════════
 * BROWSER MODE (ADR-8) — o que jsdom NÃO consegue afirmar sobre o match.
 *
 * ⚠️ Leia o aviso no topo deste arquivo antes: o `match` NÃO é drag-and-drop, e
 * portanto a premissa do ADR-8 ("geometria de drag do @dnd-kit") não se aplica.
 * Ele está aqui mesmo assim, para não contrariar um ADR travado sem decisão —
 * e a story abaixo é deliberadamente sobre a ÚNICA coisa que o navegador
 * acrescenta de verdade neste kind: `disabled` só de fato barra o clique quando
 * existe engine de eventos com CSS e árvore de acessibilidade reais. Em jsdom
 * o atributo está lá, mas quem garante o comportamento é o próprio jsdom, não
 * o navegador que o aluno usa.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Depois de enviar, os cards ficam REALMENTE inertes: `userEvent` (que respeita
 * `pointer-events` e o estado `disabled` do navegador) não consegue desfazer o
 * par. É a asserção que só o browser mode sustenta.
 */
export const BrowserTravaAposEnviar: Story = {
  tags: ['browser-mode'],
  args: { activity: makeActivity('match', SPEC), onComplete: fn() },
  play: async ({ canvasElement }) => {
    await connectPairs(canvasElement, RIGHT_PAIRS);
    await submitAnswer(canvasElement, 'match-submit');

    const canvas = within(canvasElement);
    await expect(canvas.getAllByTestId('match-badge')).toHaveLength(6);
    for (const card of canvas.getAllByTestId('match-left-card')) {
      await expect(card).toBeDisabled();
    }

    // A tentativa de desfazer o par tem que ser um NO-OP de VERDADE. Num
    // navegador real o clique é entregue e o próprio browser o descarta por o
    // botão estar `disabled` — em jsdom quem "descarta" é a emulação.
    await userEvent.click(canvas.getAllByTestId('match-left-card')[0]);
    await expect(canvas.getAllByTestId('match-badge')).toHaveLength(6);
    await expect(canvas.getByTestId('match-submit')).toHaveAttribute('data-correct', 'true');
  },
};
