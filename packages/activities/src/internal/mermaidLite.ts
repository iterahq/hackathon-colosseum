/**
 * mermaidLite — parser puro de um SUBCONJUNTO do mermaid, sem dependência nova.
 *
 * O campo `spec.mermaid` do kind `diagram` existe desde sempre e nunca foi
 * desenhado: o renderer despejava a fonte num `<pre>`. A lib `mermaid` resolveria
 * o desenho e custaria caro demais — `mermaid@11.17.2` tem ~84 MB desempacotados
 * e arrasta `d3`, `cytoscape`, `katex`, `roughjs` e `dompurify`. O `DiagramActivity`
 * sai pelo entrypoint BASE de `@iterahq/activities`, então esse peso seria cobrado
 * de TODO consumidor, inclusive de quem só renderiza `concept`. Carregar por CDN
 * também está fora: as aulas rodam em rede de escola, e a regra de "zero fetch de
 * CDN externa em runtime" nasceu de três assets que já falharam em produção.
 *
 * Daí o subconjunto. Ele cobre o que o professor desenha ao vivo no projetor —
 * caixinhas ligadas por seta — e recusa TUDO o mais devolvendo `null`, para que o
 * chamador caia no `<pre>` de hoje. O parser nunca lança: uma fonte fora do
 * subconjunto tem que degradar para o comportamento atual, nunca para uma tela
 * quebrada no meio da aula.
 *
 * A gramática aceita, na íntegra:
 *
 *   graph TD | graph LR | flowchart TD | flowchart LR   (cabeçalho, obrigatório)
 *   A[texto]            nó retangular
 *   A(texto)            nó arredondado
 *   A --> B             aresta
 *   A -->|rótulo| B     aresta com rótulo
 *   %% comentário       ignorado, como a linha em branco
 *
 * Um id sozinho (`A --> B`) só vale se `A` e `B` já tiverem sido declarados COM
 * rótulo antes. Não é purismo: sem rótulo o desenho viraria uma caixa com uma
 * letra, que é pior para o aluno do que a fonte em texto.
 *
 * Deliberadamente FORA do subconjunto (cada um devolve `null`): `;` como
 * separador de comando, cadeia `A --> B --> C`, `subgraph`, losango `A{…}`,
 * `classDef`/`style`, seta pontilhada `-.->`, seta grossa `==>`, `erDiagram` e
 * todos os outros tipos de diagrama do mermaid.
 *
 * Segue a forma do `richText.ts`, que é o outro parser puro do pacote: funções
 * sem DOM, tipos exportados, teste ao lado.
 */

export type MermaidDirection = 'TD' | 'LR';

export type MermaidNodeShape = 'rect' | 'round';

export interface MermaidNode {
  id: string;
  label: string;
  shape: MermaidNodeShape;
  /** Camada do layout — distância em arestas até a raiz mais próxima. */
  rank: number;
  /** Posição dentro da camada, em ordem de declaração. */
  index: number;
}

export interface MermaidEdge {
  from: string;
  to: string;
  label?: string;
}

export interface MermaidGraph {
  direction: MermaidDirection;
  nodes: MermaidNode[];
  edges: MermaidEdge[];
}

const HEADER = /^(?:graph|flowchart)[ \t]+(TD|LR)$/i;
const COMMENT = /^%%/;
/** `A[texto]`, `A(texto)` ou `A` — um token de nó inteiro, ancorado. */
const NODE_TOKEN = /^([A-Za-z][A-Za-z0-9_]*)(?:\[([^[\]]*)\]|\(([^()]*)\))?$/;
/**
 * `origem --> destino` com rótulo opcional entre pipes.
 *
 * O `.+?` preguiçoso do lado esquerdo casa até a PRIMEIRA seta, então
 * `A --> B --> C` deixa `B --> C` do lado direito — que não é um token de nó e
 * derruba a linha inteira. É assim que a cadeia fica fora do subconjunto sem
 * precisar de uma regra própria.
 */
const EDGE = /^(.+?)[ \t]*-->[ \t]*(?:\|([^|]*)\|[ \t]*)?(.+)$/;

/**
 * Tetos de tamanho. Fonte acima deles devolve `null` e sai como `<pre>`, que é o
 * mesmo destino de qualquer fonte fora do subconjunto — nada regride.
 *
 * Não é higiene: cada teto tranca um custo MEDIDO. `MAX_LINE_CHARS` corta o
 * backtracking quadrático do `EDGE` (o `.+?` preguiçoso contra o `[ \t]*` guloso
 * levava 1,6 s numa linha de 40 mil caracteres sem seta, com a thread parada);
 * `MAX_NODES` e `MAX_EDGES` limitam o layout. Um diagrama de aula tem uma dúzia
 * de caixas — a folga é enorme de propósito, para que o teto só encoste em fonte
 * que já não era desenho.
 */
const MAX_LINES = 300;
const MAX_LINE_CHARS = 400;
const MAX_NODES = 120;
const MAX_EDGES = 300;

/**
 * Fonte mermaid → grafo com layout em camadas, ou `null` se algo sair do
 * subconjunto. `null` é o único canal de erro: o chamador troca por `<pre>`.
 */
export function parseMermaidLite(input: string | null | undefined): MermaidGraph | null {
  if (!input || !input.trim()) return null;

  const lines = input.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > MAX_LINES) return null;
  const declared = new Map<string, { id: string; label: string; shape: MermaidNodeShape }>();
  const order: string[] = [];
  const edges: MermaidEdge[] = [];
  let direction: MermaidDirection | null = null;

  /** Token → id declarado, ou `null` se o token não pertence ao subconjunto. */
  const declare = (token: string): string | null => {
    const match = token.match(NODE_TOKEN);
    if (!match) return null;

    const [, id, rect, round] = match;
    if (rect === undefined && round === undefined) return declared.has(id) ? id : null;

    const label = (rect ?? round ?? '').trim();
    if (!label) return null;

    // Primeira declaração vence. O autor repete `A[Lista]` em cada aresta que
    // sai de A — é a forma natural de escrever — e a repetição não pode virar
    // um segundo nó nem trocar o rótulo no meio do desenho.
    if (!declared.has(id)) {
      declared.set(id, { id, label, shape: rect !== undefined ? 'rect' : 'round' });
      order.push(id);
    }
    return id;
  };

  for (const raw of lines) {
    if (raw.length > MAX_LINE_CHARS) return null;
    const line = raw.trim();
    if (line === '' || COMMENT.test(line)) continue;

    if (direction === null) {
      const header = line.match(HEADER);
      if (!header) return null;
      direction = header[1].toUpperCase() as MermaidDirection;
      continue;
    }

    const edge = line.match(EDGE);
    if (edge) {
      const from = declare(edge[1].trim());
      const to = declare(edge[3].trim());
      if (!from || !to) return null;
      const label = edge[2]?.trim();
      edges.push(label ? { from, to, label } : { from, to });
      continue;
    }

    if (!declare(line)) return null;
  }

  if (direction === null || order.length === 0) return null;
  if (order.length > MAX_NODES || edges.length > MAX_EDGES) return null;

  const ranks = rankNodes(order, edges);
  const perRank = new Map<number, number>();
  const nodes: MermaidNode[] = order.map((id) => {
    const rank = ranks.get(id) ?? 0;
    const index = perRank.get(rank) ?? 0;
    perRank.set(rank, index + 1);
    return { ...declared.get(id)!, rank, index };
  });

  return { direction, nodes, edges };
}

/**
 * Camadas, sem dagre.
 *
 * Num DAG a camada é o CAMINHO MAIS LONGO até a raiz, não o mais curto: com
 * `A-->B`, `A-->C`, `B-->C`, a distância mais curta poria B e C lado a lado e a
 * seta de B para C ficaria deitada dentro da mesma linha. O caminho mais longo
 * empurra C uma camada adiante e o desenho volta a descer.
 *
 * Com ciclo não existe caminho mais longo, então cai numa BFS a partir das raízes
 * — que visita cada nó UMA vez e por isso termina mesmo em `A-->B-->A`. Um grafo
 * todo em ciclo não tem raiz nenhuma; aí a semente é o primeiro nó declarado, e o
 * resto entra por sementes sucessivas para que nenhum nó fique sem camada.
 */
function rankNodes(order: string[], edges: MermaidEdge[]): Map<string, number> {
  const out = new Map<string, string[]>(order.map((id) => [id, []]));
  const indegree = new Map<string, number>(order.map((id) => [id, 0]));

  for (const edge of edges) {
    out.get(edge.from)!.push(edge.to);
    if (edge.from !== edge.to) indegree.set(edge.to, indegree.get(edge.to)! + 1);
  }

  const ranks = new Map<string, number>();
  const roots = order.filter((id) => indegree.get(id) === 0);

  if (!hasCycle(order, out)) {
    const pending = new Map(indegree);
    const queue = [...roots];
    for (const id of queue) ranks.set(id, 0);
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      for (const next of out.get(id)!) {
        ranks.set(next, Math.max(ranks.get(next) ?? 0, ranks.get(id)! + 1));
        pending.set(next, pending.get(next)! - 1);
        if (pending.get(next) === 0) queue.push(next);
      }
    }
    return ranks;
  }

  const queue: string[] = [];
  const seed = (id: string) => {
    if (ranks.has(id)) return;
    ranks.set(id, 0);
    queue.push(id);
  };
  for (const id of roots.length ? roots : [order[0]]) seed(id);
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    for (const next of out.get(id)!) {
      if (ranks.has(next)) continue;
      ranks.set(next, ranks.get(id)! + 1);
      queue.push(next);
    }
    if (head === queue.length - 1) {
      const orphan = order.find((candidate) => !ranks.has(candidate));
      if (orphan) seed(orphan);
    }
  }
  return ranks;
}

/**
 * DFS de três cores — só precisa do veredito, não do ciclo em si.
 *
 * A pilha é EXPLÍCITA, e não a de chamadas: a profundidade aqui é o caminho mais
 * longo do grafo, e uma cadeia de alguns milhares de arestas estourava a pilha do
 * JavaScript. O `RangeError` não seria pego por ninguém — este app não tem error
 * boundary — e a rota inteira apagaria no meio da aula.
 */
function hasCycle(order: string[], out: Map<string, string[]>): boolean {
  const state = new Map<string, 0 | 1 | 2>();

  for (const root of order) {
    if (state.get(root) === 2) continue;
    const stack: { id: string; next: number }[] = [{ id: root, next: 0 }];
    state.set(root, 1);

    while (stack.length) {
      const frame = stack[stack.length - 1];
      const children = out.get(frame.id) ?? [];
      if (frame.next === children.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }

      const child = children[frame.next++];
      const seen = state.get(child);
      if (seen === 1) return true;
      if (seen === 2) continue;
      state.set(child, 1);
      stack.push({ id: child, next: 0 });
    }
  }
  return false;
}

/**
 * A chave de comparação entre o `term` de um highlight e o rótulo de um nó.
 *
 * Minúsculas, sem acento e com espaço colapsado — e a pontuação PRESERVADA, de
 * propósito: o mesmo autor escreve os dois lados, e `.map()` casar com `map`
 * seria conveniente até o dia em que uma aula tem os dois nós.
 */
export function normalizeMermaidLabel(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Quebra de rótulo para caber na caixa, em no máximo `maxLines` linhas.
 *
 * Mora aqui, e não no componente, porque é texto puro: o SVG não faz quebra
 * sozinho (`<text>` não tem `overflow`), então a conta é feita antes de desenhar
 * e pode ser provada sem DOM. `maxChars` é orçamento de CARACTERES, não de
 * pixels — a fonte da marca é proporcional, então a estimativa é grosseira de
 * propósito e a caixa tem folga para absorver o erro.
 */
export function wrapLabel(label: string, maxChars: number, maxLines = 2): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  let consumed = 0;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    // `current === ''` deixa passar a palavra sozinha maior que o orçamento —
    // ela ocupa a linha inteira e é cortada no fim, em vez de travar o laço.
    if (candidate.length <= maxChars || current === '') {
      current = candidate;
      consumed++;
      continue;
    }
    lines.push(current);
    if (lines.length === maxLines) {
      current = '';
      break;
    }
    current = word;
    consumed++;
  }
  if (current && lines.length < maxLines) lines.push(current);

  const dropped = consumed < words.length;
  return lines.map((line, i) => {
    const cut = line.length > maxChars || (dropped && i === lines.length - 1);
    return cut ? `${line.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…` : line;
  });
}
