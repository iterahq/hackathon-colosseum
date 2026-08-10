/**
 * As interações do `code` GUIADO, escritas UMA vez — mesmo contrato do
 * `./interactions` (DOM real, `data-testid` de produção, dois clientes: o `play`
 * das stories e o Vitest). Arquivo próprio porque o `interactions.ts` já está no
 * teto de tamanho do repo, não porque o guiado seja um mundo separado.
 */
import { userEvent, within } from 'storybook/test';

type Canvas = HTMLElement;

/**
 * Preenche as lacunas pelo mecanismo que o autor escolheu em cada uma: dropdown
 * ao lado da lacuna, campo de texto, ou chip do banco. UM helper para as três
 * formas porque a variante `mixed` mistura as três na mesma tela — quem dirige a
 * atividade não deveria ter que saber qual é qual.
 */
export async function fillGuidedBlanks(canvasElement: Canvas, values: Record<string, string>) {
  const canvas = within(canvasElement);
  for (const [id, value] of Object.entries(values)) {
    const widget = canvas.getByTestId(`guided-blank-${id}`);
    const kind = widget.getAttribute('data-blank-kind');
    if (kind === 'select') {
      await userEvent.selectOptions(widget, value);
      continue;
    }
    if (kind === 'text') {
      await userEvent.click(widget);
      await userEvent.paste(value);
      continue;
    }
    // `bank`: mira a lacuna e só então gasta o chip. O banco é compartilhado, e
    // sem a mira o chip cairia na primeira lacuna vazia — o que é o caminho
    // natural do aluno, mas não serve para um helper que endereça por id.
    await userEvent.click(widget);
    const chips = canvas.getAllByTestId('guided-bank-chip');
    const chip = chips.find((c) => c.getAttribute('data-value') === value);
    if (!chip) {
      throw new Error(
        `code guiado: nenhum chip com o valor ${JSON.stringify(value)}. ` +
          `No banco: ${chips.map((c) => JSON.stringify(c.getAttribute('data-value'))).join(', ')}`,
      );
    }
    await userEvent.click(chip);
  }
}

/** Envia o template guiado e segue com o veredito que apareceu. */
export async function settleGuided(canvasElement: Canvas) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByTestId('guided-submit'));
  await userEvent.click(canvas.getByTestId('guided-continue'));
}
