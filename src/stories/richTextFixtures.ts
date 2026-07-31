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
