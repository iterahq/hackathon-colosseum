import type { Meta, StoryObj } from '@storybook/react';
import { parseMermaidLite } from '@iterahq/activities';
import { MermaidLite } from '@/components/branded/activity/MermaidLite';

/**
 * MermaidLite — o desenho de um SUBCONJUNTO do mermaid, em SVG puro e sem
 * dependência nova.
 *
 * A lib `mermaid` está fora: `mermaid@11.17.2` tem ~84 MB desempacotados e
 * arrasta `d3`, `cytoscape`, `katex`, `roughjs` e `dompurify` — e o
 * `DiagramActivity` sai pelo entrypoint BASE de `@iterahq/activities`, então
 * esse peso seria cobrado até de quem só renderiza `concept`. CDN também está
 * fora pela regra de "zero fetch externo em runtime" (aula em rede de escola).
 *
 * O componente é SEM ESTADO: aceso, fixado e interativo entram por prop, o que
 * é justamente o que deixa as variações abaixo existirem sem simular clique. Em
 * produção quem segura esse estado é o `DiagramActivity`.
 *
 * A gramática inteira que o parser aceita — e o `null` que devolve para todo o
 * resto — está no docblock de `packages/activities/src/internal/mermaidLite.ts`.
 */
const meta: Meta<typeof MermaidLite> = {
  title: 'Molecules/Activity/MermaidLite',
  component: MermaidLite,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  decorators: [
    (Story) => (
      <div style={{ width: 'min(560px, 100vw)', padding: 16, background: '#141210' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof MermaidLite>;

/** `!` é seguro aqui: cada fonte abaixo é escrita dentro do subconjunto. */
const graph = (source: string) => parseMermaidLite(source)!;

const MAP = graph(
  [
    'graph TD',
    '  A[Lista original] --> B(.map)',
    '  B -->|um item por vez| C[Função de transformação]',
    '  C --> D[Lista nova]',
  ].join('\n'),
);

/** `graph TD` — camadas de cima para baixo, o formato padrão de uma aula. */
export const Vertical: Story = {
  args: { graph: MAP, title: 'O caminho de uma lista pelo .map' },
};

/** `graph LR` — mesma gramática, camadas da esquerda para a direita. */
export const Horizontal: Story = {
  args: {
    title: 'A linha do tempo de commits',
    graph: graph(
      [
        'flowchart LR',
        '  A[commit 1] --> B[commit 2]',
        '  B -->|git commit| C[commit 3]',
        '  C --> D(HEAD)',
      ].join('\n'),
    ),
  },
};

/**
 * Um nó com dois filhos e um reencontro: o `C` desce DUAS camadas mesmo tendo
 * uma aresta direta de `A`, porque a camada é o caminho mais longo. Sem isso a
 * seta `B --> C` sairia deitada dentro da mesma linha.
 */
export const Ramificacao: Story = {
  args: {
    title: 'Ramificação e reencontro',
    graph: graph(
      [
        'graph TD',
        '  A[Pull request aberta] --> B[Review do time]',
        '  A --> C[CI roda os testes]',
        '  B -->|aprovada| C',
        '  C --> D(Merge na main)',
      ].join('\n'),
    ),
  },
};

/** Rótulo que não cabe: quebra em duas linhas e corta com reticências, sem vazar. */
export const RotuloLongo: Story = {
  args: {
    title: 'Rótulo comprido',
    graph: graph(
      [
        'graph TD',
        '  A[Uma lista com muitos itens dentro dela] --> B(supercalifragilisticexpialidocious)',
      ].join('\n'),
    ),
  },
};

/**
 * O estado ACESO, montado por prop.
 *
 * `activeNodeId` é o que o `DiagramActivity` liga ao chip de highlight; a story
 * consegue mostrá-lo parado porque o componente não guarda estado nenhum.
 */
export const NoAceso: Story = {
  args: {
    graph: MAP,
    title: 'O caminho de uma lista pelo .map',
    interactiveNodeIds: ['A', 'B', 'D'],
    activeNodeId: 'B',
    pinnedNodeId: 'B',
    onNodePin: () => {},
    onNodePreview: () => {},
  },
};
