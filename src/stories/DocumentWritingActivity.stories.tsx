import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import { ActivityRenderer } from '@/components/branded/activity/ActivityRenderer';
import { makeActivity } from './activityFixtures';
import { DOCUMENT_WRITING_RUBRIC, DOCUMENT_WRITING_SPEC } from './contractFixtures';
import { withActivityWidth } from './decorators';
import { markDone, writeReflection } from './interactions';

/**
 * CONTRATO `document` — MODO REDAÇÃO.
 *
 *   { prompt, body? }  +  rubric { min_words? }
 *
 * Mesmo `kind` do modo leitura, mas a autoria entrega OUTRA metadata — e ela
 * troca o renderer: aparece um `textarea` de verdade, um contador de palavras e
 * a conclusão fica travada até bater o `min_words`. Como o que a ferramenta de
 * autoria precisa passar é diferente (e o resultado na tela é outro), tratamos
 * como contrato próprio, na função "Produção".
 *
 * O gatilho, no código, é `isReflection = Boolean(spec.prompt) || min_words > 0`.
 *
 * ── FASE 3 (ADR-4) ─────────────────────────────────────────────────────────
 * O `document` nunca teve prop `initial*`, e a Fase 2 registrou as células
 * `C.answered`/`C.submitted` como adiadas justamente por isso. Elas fecham
 * aqui, DIGITANDO: um rascunho curto (abaixo do `min_words`) mantém o botão
 * travado; um texto que bate a meta destrava e conclui.
 *
 * `document` ainda é stub LOOSE no `@iterahq/activity-spec`
 * (`z.record(z.unknown())`); o `rubric` não é validado por schema nenhum. Os
 * fixtures abaixo saíram do que o `ReflectionDocumentActivity` de fato LÊ.
 */
const meta: Meta<typeof ActivityRenderer> = {
  title: 'Organisms/Activities/5 · Produção/Document (redação)',
  id: 'activities-producao-document-redacao',
  component: ActivityRenderer,
  decorators: [withActivityWidth],
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  args: { onComplete: fn() },
};
export default meta;
type Story = StoryObj<typeof ActivityRenderer>;

/** `prompt` + `rubric.min_words` → contador com meta; escreva no canvas. */
export const ComMinimoDePalavras: Story = {
  args: {
    activity: makeActivity('document', DOCUMENT_WRITING_SPEC, undefined, DOCUMENT_WRITING_RUBRIC),
  },
};

/** Variação: só `prompt`, sem rubric → redação livre (qualquer texto conclui). */
export const RedacaoLivre: Story = {
  args: {
    activity: makeActivity('document', {
      prompt: 'Conte, em poucas linhas, uma coisa que você aprendeu nesta aula.',
    }),
  },
};

/** Variação: `body` funciona como um apoio/enunciado longo acima do textarea. */
export const ComTextoDeApoio: Story = {
  args: {
    activity: makeActivity(
      'document',
      {
        prompt: 'Descreva como você organizaria os dados de um clube de leitura.',
        body: [
          'Pense nas informações que a escola precisaria guardar: quem são os participantes,',
          'quais livros existem e quem pegou emprestado o quê.',
          '',
          'Não precisa escrever código — descreva com suas palavras.',
        ].join('\n'),
      },
      undefined,
      { min_words: 40 },
    ),
  },
};

/**
 * C.answered — RASCUNHO abaixo do `min_words`. É o estado que o contador serve
 * para comunicar, e é o único gate de conclusão que o `document` tem.
 */
export const RascunhoCurto: Story = {
  args: {
    activity: makeActivity('document', DOCUMENT_WRITING_SPEC, undefined, DOCUMENT_WRITING_RUBRIC),
  },
  play: async ({ args, canvasElement }) => {
    await writeReflection(canvasElement, 'Ainda estou pensando em como explicar isso.');
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('document-word-count').textContent).toMatch(/^7 /);
    await expect(canvas.getByTestId('activity-done')).toBeDisabled();
    await expect(args.onComplete).not.toHaveBeenCalled();
  },
};

/**
 * C.submitted — redação ENVIADA. Passando o `min_words`, o botão destrava e a
 * conclusão sobe com o texto escrito (`response` + `artifact`).
 */
export const RedacaoEnviada: Story = {
  args: {
    activity: makeActivity('document', DOCUMENT_WRITING_SPEC, undefined, DOCUMENT_WRITING_RUBRIC),
  },
  play: async ({ args, canvasElement }) => {
    await writeReflection(
      canvasElement,
      'A chave primaria e a coluna que identifica cada linha de forma unica dentro de uma ' +
        'tabela. No caso da escola o numero de matricula funciona bem porque nunca se repete ' +
        'entre dois alunos diferentes e nunca fica vazio para ninguem.',
    );
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId('activity-done')).not.toBeDisabled();
    await markDone(canvasElement);
    await expect(args.onComplete).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ response: expect.stringContaining('matricula') }),
    );
  },
};

/** Variação de ESTADO: activity concluída → botão travado em "Concluída". */
export const Concluida: Story = {
  args: {
    activity: makeActivity('document', DOCUMENT_WRITING_SPEC, 'done', DOCUMENT_WRITING_RUBRIC),
  },
};
