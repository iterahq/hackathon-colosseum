import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { CODE_EDITOR_CHECKS_SPEC, CODE_FILL_BANK_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';

/**
 * KIND `code_editor_checks` — plan `20260924-activity-type-one-behavior-rule` (one activity
 * type = one behaviour). Type in the open editor; DOM `checks` grade the preview.
 *
 * The stories here are STATES of this one behaviour, nothing else. The matrix
 * row lives in `src/test/activityMatrixCoverage.test.ts`.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Activities/Code/code_editor_checks',
  id: 'activities-code-editor-checks',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

const activity = (spec: Record<string, unknown> = SPEC, status?: 'done') =>
  makeActivity('code_editor_checks', spec, status);

const SPEC = CODE_EDITOR_CHECKS_SPEC as Record<string, unknown>;

const HTML_CHECKS = [
  { id: 'title', label: 'The page has a title', selector: 'head > title', assert: { type: 'exists' } },
  { id: 'heading', label: 'The heading greets the reader', selector: 'h1', assert: { type: 'text', contains: 'Hello' } },
];

const htmlSpec = (starter: string) => ({
  prompt: 'Write your first page: give it a title and a greeting heading.',
  starter,
  language: 'html',
  checks: HTML_CHECKS,
});

const HTML_FAILING_STARTER = '<!doctype html><html lang="en"><head></head><body><h1>Welcome</h1></body></html>';
const HTML_SOLVED_STARTER =
  '<!doctype html><html lang="en"><head><title>My page</title></head><body><h1>Hello, world!</h1></body></html>';
const HTML_UNCLOSED_STARTER = '<!doctype html><html><head><title>My page<body><h1>Hello<div><p>never closed';

/** A.enabled + C.blank — the open editor on the starter, and the live preview. */
export const Default: Story = {
  args: { activity: activity() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryAllByTestId(/^guided-blank-/)).toHaveLength(0);
  },
};

/** B.done — concluded in an earlier session. */
export const Concluida: Story = { args: { activity: activity(SPEC, 'done') } };

/** F.spec_invalido — A template with blanks belongs to the `code_fill_*` kinds. The kind shows the card; it never draws another behaviour. */
export const EspecInvalida: Story = {
  args: { activity: activity(CODE_FILL_BANK_SPEC as Record<string, unknown>) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('code-editor-checks-invalid')).toBeInTheDocument();
  },
};

/** A.enabled + language html — the html starter runs in the live preview; the checks fail on it. */
export const HtmlStarterFailing: Story = {
  args: { activity: activity(htmlSpec(HTML_FAILING_STARTER)) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('code-preview-iframe')).toBeInTheDocument();
  },
};

/** D.correct + language html — a solved page: the same checks pass on submit. */
export const HtmlSolved: Story = {
  args: { activity: activity(htmlSpec(HTML_SOLVED_STARTER)) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('code-preview-iframe')).toBeInTheDocument();
  },
};

/** H.degenerado + language html — unclosed tags: the parser repairs them, grading still ends. */
export const HtmlUnclosedTags: Story = {
  args: { activity: activity(htmlSpec(HTML_UNCLOSED_STARTER)) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByTestId('code-preview-iframe')).toBeInTheDocument();
  },
};
