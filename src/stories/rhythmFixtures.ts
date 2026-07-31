/**
 * Textos da camada de ritmo: `---` corta o conceito em passos e `?>`/`?=` pede
 * que o aluno responda na cabeça antes de ver a resposta.
 *
 * `FLAT_GIT` e `RHYTHM_GIT` são o MESMO conteúdo — o texto real da aula de Git
 * do Educar+ — antes e depois da camada. Ficam lado a lado de propósito: é a
 * comparação que mostra o que a marcação muda, e não um exemplo inventado.
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
\`\`\``;

export const RHYTHM_GIT = `## O que tem dentro de uma página do caderno

Cada página do caderno se chama **commit**. É a peça mais importante do Git.

---

**Todo commit tem cinco coisas:**

**1. A foto do projeto.** Não só o que mudou: como **todos** os arquivos estavam naquele instante. Por isso dá pra voltar.
**2. O bilhete.** Uma frase sua explicando a página. Ex.: *"arrumei o preço do bolo"*.
**3. Data e hora.** Carimbo sozinho.
**4. O autor.** Quem colou. Também automático.

---

**5. O código curto (o *hash*).** Tipo \`9c1d044\`: a identidade da página, que nunca se repete.

?> Você precisa decorar esse código?
?= Não. Você **copia e cola**. Ele existe pra identificar a página, não pra você guardar de cabeça.

---

E cola assim:

\`\`\`
git commit -m "arrumei o preço do bolo de cenoura"
\`\`\`

> Errou? Volte para qualquer foto. Nada se perde.`;

export const STEPPED_CONCEPT = `## Props

Uma prop é um valor que o componente **recebe de fora**. Quem manda é o pai.

\`\`\`jsx
<BookCard title="Dom Casmurro" />
\`\`\`

---

Dentro do componente a prop chega como argumento:

\`\`\`jsx
function BookCard({ title }) {
  return <h2>{title}</h2>;
}
\`\`\`

---

?> Se você trocar \`title\` dentro do BookCard, a tela atualiza?
?= Não. Prop é **somente leitura** — quem troca é quem passou.

> Prop vem de fora e não muda aqui. Estado nasce dentro e muda aqui.`;

export const LIVE_CONCEPT = `Ao vivo o aluno não escolhe o ritmo.

---

?> Por que não revelar por aluno numa aula ao vivo?
?= Porque metade da turma ficaria olhando um pedaço diferente do que está sendo dito.`;

export const REVEAL_ONLY = `Um \`useEffect\` sem lista de dependências roda depois de **toda** renderização.

?> E com a lista vazia \`[]\`?
?= Roda uma vez só, quando o componente monta.`;

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

> Citação: o destaque que fecha uma ideia.

---

?> Pergunta que segura o aluno antes da resposta
?= Resposta, revelada só depois do clique.`;
