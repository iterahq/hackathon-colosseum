/**
 * Textos REAIS de aula usados nas stories do markdown-leve.
 *
 * `FLAT_GIT` é o conteúdo da aula de Git do Educar+ como ele está no banco:
 * fixture de tela cheia, não exemplo inventado. `VOCABULARY` é o outro extremo —
 * todo bloco que o parser conhece num texto só, o dicionário da marcação.
 *
 * A camada de "ritmo" (`---` cortando em passos, `?>`/`?=` escondendo a
 * resposta) foi aposentada em 2026-07-31: o passo virou clique sem informação em
 * troca, e o pense-antes virou o kind `concept_reveal`.
 */
export const FLAT_GIT = `## O que tem dentro de uma página do caderno

Cada página do caderno se chama **commit**. É a peça mais importante do Git.

**Todo commit tem cinco coisas:**

**1. A foto do projeto.** Não só o que mudou: como **todos** os arquivos estavam naquele instante. Por isso dá pra voltar.
**2. O bilhete.** Uma frase sua explicando a página. Ex.: *"arrumei o preço do bolo"*.
**3. Data e hora.** Carimbo sozinho.
**4. O autor.** Quem colou. Também automático.
**5. O código curto (o *hash*).** Tipo \`9c1d044\`: a identidade da página, que nunca se repete. Você copia e cola, não decora.

E cola assim:

\`\`\`
git commit -m "arrumei o preço do bolo de cenoura"
\`\`\`

> Errou? Volte para qualquer foto. Nada se perde.`;

export const PROPS_CONCEPT = `## Props

Uma prop é um valor que o componente **recebe de fora**. Quem manda é o pai.

\`\`\`jsx
<BookCard title="Dom Casmurro" />
\`\`\`

Dentro do componente a prop chega como argumento:

\`\`\`jsx
function BookCard({ title }) {
  return <h2>{title}</h2>;
}
\`\`\`

> Prop vem de fora e não muda aqui. Estado nasce dentro e muda aqui.`;

/**
 * A long reading screen: eight-plus blocks, two four-line paragraphs, both
 * list kinds, a quote, inline code, key-phrase marks and a fenced block. The
 * test of the reading feel is this, not a three-line demo.
 */
export const LONG_FUNCTION = `## O que é uma função

Uma função é um ==pedaço de código com nome== que você escreve uma vez e chama quantas vezes quiser. Pense numa receita de bolo colada na geladeira: você não reescreve a receita toda vez que vai fazer um bolo, só olha pra ela e segue os passos. No código é igual — você define a função uma vez e, quando precisa do resultado, chama pelo nome.

**Toda função tem três partes:**

- O **nome**, que é como você chama ela depois. Ex.: \`calcularTotal\`.
- Os **parâmetros**, que são os ingredientes que entram. Ex.: a lista de preços.
- O **retorno**, que é o bolo pronto: o valor que sai quando a função termina.

Sem função, o mesmo cálculo apareceria copiado em cinco lugares diferentes, e no dia que o imposto mudasse você teria que achar os cinco e corrigir um por um. Com função, você corrige num lugar só e todos os cinco passam a usar a versão nova — é por isso que programador fala tanto em ==não se repetir==.

### Como se escreve

1. Escreva \`function\` e o nome que você escolheu.
2. Entre parênteses, liste os parâmetros separados por vírgula.
3. Entre chaves, escreva o que a função faz.
4. Use \`return\` para devolver o resultado.

\`\`\`js
function calcularTotal(precos) {
  const soma = precos.reduce((a, b) => a + b, 0);
  return soma * 1.1;
}

calcularTotal([10, 20, 30]); // 66
\`\`\`

Repare que \`calcularTotal([10, 20, 30])\` é uma *chamada*: o nome seguido de parênteses com os ingredientes dentro. A função roda, chega no \`return\` e entrega o valor pra quem chamou. Se você esquecer o \`return\`, a função roda do mesmo jeito mas devolve \`undefined\`, que é o jeito do JavaScript dizer "não tenho nada pra te dar".

> Função é a menor unidade de reuso que existe. Quando algo se repete, o primeiro instinto deve ser dar um nome pra aquilo.`;

/** Todo bloco que o parser conhece, num texto só — é o dicionário da marcação. */
export const VOCABULARY = `## Título de seção

### Subtítulo

Parágrafo com **negrito**, *itálico* e \`código curto\`.

- item de lista
- outro item

1. primeiro passo
2. segundo passo

\`\`\`jsx
const total = precos.reduce((a, b) => a + b, 0);
\`\`\`

> Citação: o destaque que fecha uma ideia.`;
