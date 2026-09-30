/**
 * richTextInline — a camada de DENTRO da linha: negrito, marca-texto (`==x==`), ênfase e código inline.
 *
 * Vive separada de `richText.ts` (que corta o texto em blocos) porque as duas
 * camadas se leem sozinhas e o arquivo único passava do teto de linhas do repo.
 *
 * Escopo deliberadamente fechado (sem HTML embutido, sem link): conteúdo de aula
 * é dado do banco, e cada construção a mais é superfície de injeção.
 */
export type Inline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; spans: Inline[] }
  | { type: 'mark'; spans: Inline[] }
  | { type: 'em'; spans: Inline[] };

/**
 * Duas escolhas que não se leem sozinhas:
 *
 * — negrito e itálico exigem não-espaço nas duas bordas, senão `5 * 3 * 2` e
 *   `a ** b ** c` viravam marcação, e aritmética em texto de aula é mais comum
 *   que ênfase — a bolha do sandbox ainda por cima carrega saída de terminal.
 *   Pela mesma razão o negrito não abre em barra: dois asteriscos seguidos de
 *   barra são glob de shell, não marcação;
 * — `==frase-chave==` é o marca-texto: o negrito é só ênfase, e o que o aluno
 *   deve levar da tela ganha o destaque. Mesma regra de bordas sem espaço;
 * — nenhuma marcação atravessa `\n`, então delimitador aberto por engano morre
 *   no fim da linha em vez de sequestrar o resto do parágrafo.
 */
const INLINE_PATTERN =
  /(==(?![\s=])(?:[^=\n]|=(?!=))*?[^=\s]==|\*\*\*(?!\s)[^*\n]*[^*\s]\*\*\*|\*\*(?![\s/])(?:[^*\n]|\*(?!\*))+?(?<!\s)\*\*|`[^`\n]+`|(?<!\*)\*(?!\s)[^*\n]*[^*\s]\*(?!\*))/g;

/**
 * Quebra uma linha nos delimitadores inline. Nada casou? Um span de texto.
 *
 * Ênfase e negrito guardam filhos em vez de string porque o autor escreve
 * `**1. Sentou? \`git pull\`.**` — texto real da aula de Git que já foi dada — e
 * com valor plano a crase sobraria na tela. Recursão termina sozinha: cada
 * nível consome os próprios delimitadores, então a fatia sempre encurta.
 */
export function parseInline(line: string): Inline[] {
  const spans: Inline[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE_PATTERN)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) spans.push({ type: 'text', value: line.slice(last, start) });
    if (token.startsWith('=='))
      spans.push({ type: 'mark', spans: parseInline(token.slice(2, -2)) });
    else if (token.startsWith('`')) spans.push({ type: 'code', value: token.slice(1, -1) });
    else if (token.startsWith('***'))
      spans.push({ type: 'strong', spans: [{ type: 'em', spans: parseInline(token.slice(3, -3)) }] });
    else if (token.startsWith('**'))
      spans.push({ type: 'strong', spans: parseInline(token.slice(2, -2)) });
    else spans.push({ type: 'em', spans: parseInline(token.slice(1, -1)) });
    last = start + token.length;
  }
  if (last < line.length) spans.push({ type: 'text', value: line.slice(last) });
  return spans.length > 0 ? spans : [{ type: 'text', value: line }];
}
