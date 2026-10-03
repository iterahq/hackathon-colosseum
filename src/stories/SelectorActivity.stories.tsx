import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SelectorActivity } from '@/components/branded/activity/SelectorActivity';
import { makeGatedActivity, SELECTOR_SPEC } from './sceneMechanicsFixtures';
import { withActivityWidth } from './decorators';

/**
 * CENA `selector` (2026-09-25, batch A) — pick the selector chip that matches
 * `targets` EXACTLY. A wrong chip lights up the wrong elements and shows a
 * hint; the learner cannot fail. No submit; silent. 🚧 do-not-merge — see the
 * release-gate note in `packages/activities/src/specs.ts`.
 */
const meta: Meta<typeof SelectorActivity> = {
  title: 'Organisms/Activities/8 · Cena/Selector',
  id: 'activities-cena-selector',
  component: SelectorActivity,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof SelectorActivity>;

/** A.enabled / C.blank — nenhum chip escolhido ainda; a regra espera um seletor; a guia fala pelo nome. */
export const Default: Story = {
  args: { activity: makeGatedActivity('selector', { ...SELECTOR_SPEC, guide: { name: 'Tera' } }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('selector-option-h1')).toHaveAttribute('aria-pressed', 'false');
    await expect(canvas.getByTestId('scene-guide')).toHaveTextContent('Tera');
    await expect(canvas.getByTestId('selector-rule')).toHaveTextContent('? { color: #DB2777; }');
    // The element shows its tag and text, never an id the page code does not have.
    await expect(canvas.getByTestId('selector-element-intro')).toHaveTextContent('<p> Intro');
    await expect(canvas.getByTestId('selector-element-intro')).not.toHaveTextContent('#');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/** An `id` chip: the element it names carries a real `id` attribute on the page. */
export const IdSelector: Story = {
  args: {
    activity: makeGatedActivity('selector', {
      ...SELECTOR_SPEC,
      options: ['p', '#intro', 'a'],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('selector-element-intro')).toHaveTextContent('<p id="intro"> Intro');
    await expect(canvas.getByTestId('selector-element-titulo')).not.toHaveTextContent('id=');
  },
};

/** D.incorrect → D.correct — um chip errado mostra dica; o certo abre o gate. */
export const WrongThenRight: Story = {
  args: { activity: makeGatedActivity('selector', SELECTOR_SPEC) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('selector-option-h1'));
    await expect(canvas.getByTestId('scene-wrong-hint')).toHaveTextContent(/./);
    await expect(args.onComplete).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByTestId('selector-option-p'));
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    await expect(canvas.getByTestId('selector-rule')).toHaveTextContent('p { color: #DB2777; }');
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
    // The chips stay live after the gate: comparing selectors is the point, and the verdict fired once.
    await userEvent.click(canvas.getByTestId('selector-option-h1'));
    await expect(canvas.getByTestId('selector-element-titulo')).toHaveAttribute('data-lit', 'true');
    await expect(canvas.getByTestId('selector-rule')).toHaveTextContent('h1 { color: #DB2777; }');
    await userEvent.click(canvas.getByTestId('selector-option-p'));
    await expect(args.onComplete).toHaveBeenCalledTimes(1);
  },
};

/** B.done — concluída numa sessão anterior: abre resolvida direto. */
export const Done: Story = {
  args: { activity: makeGatedActivity('selector', SELECTOR_SPEC, 'done') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('scene-stamp')).toBeInTheDocument();
    // Opens on the chip that solved it, so the answer is on screen.
    await expect(canvas.getByTestId('selector-option-p')).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByTestId('selector-element-intro')).toHaveAttribute('data-lit', 'true');
    await expect(canvas.getByTestId('selector-rule')).toHaveTextContent('p { color: #DB2777; }');
    await userEvent.click(canvas.getByTestId('selector-option-a'));
    await expect(canvas.getByTestId('selector-element-link')).toHaveAttribute('data-lit', 'true');
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};
