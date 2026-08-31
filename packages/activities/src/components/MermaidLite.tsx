/**
 * MermaidLite — o desenho do subconjunto, em SVG puro.
 *
 * Recebe um grafo JÁ PARSEADO em vez da fonte mermaid, de propósito: quem chama
 * precisa saber que o parse falhou para cair no `<pre>` de sempre, e a decisão
 * de degradar é do renderer da activity, não daqui. `parseMermaidLite` devolve
 * `null`; este componente só existe quando há grafo.
 *
 * SVG com `viewBox` e `width="100%"` porque a mesma tela é lida em dois lugares
 * ao mesmo tempo: o celular do aluno de 14 anos e o projetor da sala. Vetor
 * escala nos dois sem segunda arte e sem imagem borrada no telão.
 *
 * O componente é SEM ESTADO. Aceso, fixado e interativo entram por prop, para
 * que o `DiagramActivity` mantenha uma fonte de verdade só — a mesma que os
 * chips de highlight leem — e para que a story consiga montar qualquer estado
 * sem simular clique.
 */
import { useId } from 'react';
import { wrapLabel, type MermaidGraph, type MermaidNode } from '../internal/mermaidLite.js';

/** Caixa, folgas e orçamento de texto. Tudo em unidades do `viewBox`. */
const NODE_W = 176;
const NODE_H = 56;
/** Entre camadas — precisa caber o rótulo da aresta sem encostar nas caixas. */
const LANE_GAP = 64;
const SIBLING_GAP = 24;
const PAD = 20;
const LABEL_CHARS = 22;
const NODE_FONT = 13;
const EDGE_FONT = 11;
/** Folga entre a ponta da seta e a borda da caixa de destino. */
const ARROW_GAP = 7;

interface PlacedNode extends MermaidNode {
  x: number;
  y: number;
  lines: string[];
}

export interface MermaidLiteProps {
  graph: MermaidGraph;
  /** Nós que respondem a clique e foco. Vazio = diagrama puramente ilustrativo. */
  interactiveNodeIds?: readonly string[];
  /** O nó ACESO agora — sob o cursor, com foco, ou fixado. */
  activeNodeId?: string | null;
  /** O nó FIXADO — é dele que sai o `aria-pressed`, e só dele. */
  pinnedNodeId?: string | null;
  onNodePin?: (id: string) => void;
  onNodePreview?: (id: string | null) => void;
  /** Nome acessível do desenho; o `DiagramActivity` passa o `prompt` da activity. */
  title?: string;
  className?: string;
}

export function MermaidLite({
  graph,
  interactiveNodeIds,
  activeNodeId = null,
  pinnedNodeId = null,
  onNodePin,
  onNodePreview,
  title,
  className,
}: MermaidLiteProps) {
  // Um `<marker>` é global ao documento por id: dois diagramas na mesma página
  // (a story, o back-office) roubariam a seta um do outro sem este sufixo.
  const arrowId = `mermaid-lite-arrow-${useId().replace(/[^\w-]/g, '')}`;
  const { boxes, detours, vertical, width, height } = layout(graph);
  const interactive = new Set(interactiveNodeIds ?? []);
  const crossCenter = (vertical ? width : height) / 2;

  return (
    /**
     * `min-width` no tamanho natural do desenho, dentro de um trilho que rola, é
     * o que impede o `viewBox` de encolher a tipografia até ela sumir. Um
     * `graph LR` de cinco caixas dá 1176 unidades de largura: espremido nos
     * 360 px do celular do aluno, a fonte de 13 chega a 3,5 px e o alvo de toque
     * fica com 15 px de altura — ilegível, e impossível de acertar com o dedo.
     * Rolar de lado é chato; ler nada é pior. No projetor sobra espaço e o
     * `w-full` volta a esticar, que é o caso em que vetor compensa.
     */
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ minWidth: width }}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={title}
        className={`h-auto w-full font-sans ${className ?? ''}`}
        data-testid="mermaid-lite"
        data-direction={graph.direction}
      >
      <defs>
        <marker
          id={arrowId}
          markerWidth="9"
          markerHeight="7"
          refX="8"
          refY="3.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L9,3.5 L0,7 z" className="fill-menta" />
        </marker>
      </defs>

      <g data-testid="mermaid-lite-edges">
        {graph.edges.map((edge, i) => {
          const from = boxes.get(edge.from);
          const to = boxes.get(edge.to);
          // `MermaidLite` é exportado, então o grafo pode chegar montado à mão
          // por um consumidor externo. Aresta que nomeia um nó inexistente some,
          // em vez de derrubar a árvore inteira num `undefined.x`.
          if (!from || !to) return null;
          const lit = activeNodeId === edge.from || activeNodeId === edge.to;
          const key = `${edge.from}-${edge.to}-${i}`;

          if (edge.from === edge.to) {
            const cx = from.x + NODE_W / 2;
            return (
              <path
                key={key}
                d={`M${cx - 14},${from.y} C${cx - 14},${from.y - 18} ${cx + 14},${from.y - 18} ${cx + 14},${from.y - 1}`}
                fill="none"
                className="stroke-menta"
                strokeOpacity={lit ? 1 : 0.5}
                strokeWidth={1.6}
                markerEnd={`url(#${arrowId})`}
              />
            );
          }

          const detour = detours.get(i) ?? 0;
          const mid = { x: (from.x + to.x) / 2 + NODE_W / 2, y: (from.y + to.y) / 2 + NODE_H / 2 };
          const away = (vertical ? mid.x : mid.y) < crossCenter ? -1 : 1;
          const control = {
            x: mid.x + (vertical ? detour * away : 0),
            y: mid.y + (vertical ? 0 : detour * away),
          };

          const start = borderPoint(from, detour ? control : center(to), 2);
          const end = borderPoint(to, detour ? control : center(from), ARROW_GAP);
          // O meio da quadrática, que só coincide com o meio da reta quando não
          // há desvio — é ali que a pílula do rótulo tem que pousar.
          const at = {
            x: (start.x + 2 * control.x + end.x) / 4,
            y: (start.y + 2 * control.y + end.y) / 4,
          };
          const label = edge.label ? wrapLabel(edge.label, 18, 1)[0] : null;

          return (
            <g key={key}>
              <path
                data-edge={`${edge.from}->${edge.to}`}
                d={
                  detour
                    ? `M${start.x},${start.y} Q${control.x},${control.y} ${end.x},${end.y}`
                    : `M${start.x},${start.y} L${end.x},${end.y}`
                }
                fill="none"
                className="stroke-menta"
                strokeOpacity={lit ? 1 : 0.5}
                strokeWidth={1.6}
                markerEnd={`url(#${arrowId})`}
              />
              {label && (
                <>
                  <rect
                    x={at.x - (label.length * 6.1 + 10) / 2}
                    y={at.y - 9}
                    width={label.length * 6.1 + 10}
                    height={18}
                    rx={6}
                    className="fill-obsidiana stroke-menta"
                    strokeOpacity={0.35}
                  />
                  <text
                    x={at.x}
                    y={at.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={EDGE_FONT}
                    className="fill-gelo"
                    fillOpacity={0.8}
                  >
                    {label}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </g>

      <g data-testid="mermaid-lite-nodes">
        {graph.nodes.map((node) => {
          const box = boxes.get(node.id)!;
          const active = activeNodeId === node.id;
          const clickable = interactive.has(node.id) && Boolean(onNodePin);
          const cx = box.x + NODE_W / 2;
          const cy = box.y + NODE_H / 2;

          return (
            <g
              key={node.id}
              data-node-id={node.id}
              data-active={active ? 'true' : undefined}
              className={clickable ? 'cursor-pointer focus:outline-none' : undefined}
              {...(clickable
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-pressed': pinnedNodeId === node.id,
                    'aria-label': node.label,
                    onClick: () => onNodePin!(node.id),
                    onKeyDown: (event: React.KeyboardEvent) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onNodePin!(node.id);
                    },
                    // Foco e cursor acendem o nó; é esse aceso que serve de
                    // indicador de foco, já que um `outline` de `<g>` acompanha
                    // a bounding box do grupo e não a caixa desenhada.
                    onFocus: () => onNodePreview?.(node.id),
                    onBlur: () => onNodePreview?.(null),
                    onMouseEnter: () => onNodePreview?.(node.id),
                    onMouseLeave: () => onNodePreview?.(null),
                  }
                : {})}
            >
              <rect
                x={box.x}
                y={box.y}
                width={NODE_W}
                height={NODE_H}
                rx={node.shape === 'round' ? NODE_H / 2 : 12}
                className={active ? 'fill-verde-floresta stroke-menta' : 'fill-obsidiana stroke-menta'}
                strokeOpacity={active ? 1 : 0.45}
                strokeWidth={active ? 2.5 : 1.5}
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={NODE_FONT}
                className={active ? 'fill-menta' : 'fill-gelo'}
              >
                {box.lines.map((line, i) => (
                  <tspan
                    key={i}
                    x={cx}
                    dy={i === 0 ? -((box.lines.length - 1) * NODE_FONT * 0.6) : NODE_FONT * 1.2}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
        </g>
      </svg>
    </div>
  );
}

/**
 * Camadas → coordenadas.
 *
 * As camadas são reindexadas por posição ordenada (`lane`) em vez de usarem o
 * `rank` cru como multiplicador: um `rank` que pule um número desenharia uma
 * faixa vazia no meio do diagrama.
 *
 * Aresta que PULA uma faixa (`A-->C` num desenho onde B fica no meio) sai
 * arqueada, e o desvio abre espaço no `viewBox`. Reta, ela passaria por dentro
 * da caixa de B — e como as arestas são pintadas ANTES dos nós, B cobriria a
 * seta e a relação sumiria da tela sem nenhum sinal. O losango `A-->B`,
 * `A-->C`, `B-->C` é o primeiro desenho que um professor faz no quadro.
 */
function layout(graph: MermaidGraph) {
  const vertical = graph.direction === 'TD';
  const mainSize = vertical ? NODE_H : NODE_W;
  const crossSize = vertical ? NODE_W : NODE_H;

  const lanes = [...new Set(graph.nodes.map((n) => n.rank))].sort((a, b) => a - b);
  const laneOf = new Map(lanes.map((rank, i) => [rank, i]));
  const perLane = new Map<number, number>();
  for (const node of graph.nodes) perLane.set(node.rank, (perLane.get(node.rank) ?? 0) + 1);

  const spanOf = (count: number) => count * crossSize + (count - 1) * SIBLING_GAP;
  const maxCross = Math.max(...[...perLane.values()].map(spanOf));

  const detours = detourOf(graph, laneOf, crossSize);
  const crossPad = PAD + Math.max(0, ...detours.values()) / 2;

  const boxes = new Map<string, PlacedNode>();
  for (const node of graph.nodes) {
    const main = PAD + laneOf.get(node.rank)! * (mainSize + LANE_GAP);
    const cross =
      crossPad +
      (maxCross - spanOf(perLane.get(node.rank)!)) / 2 +
      node.index * (crossSize + SIBLING_GAP);

    boxes.set(node.id, {
      ...node,
      x: vertical ? cross : main,
      y: vertical ? main : cross,
      lines: wrapLabel(node.label, LABEL_CHARS),
    });
  }

  const mainTotal = lanes.length * mainSize + (lanes.length - 1) * LANE_GAP + 2 * PAD;
  const crossTotal = maxCross + 2 * crossPad;

  return {
    boxes,
    detours,
    vertical,
    width: vertical ? crossTotal : mainTotal,
    height: vertical ? mainTotal : crossTotal,
  };
}

/**
 * Índice da aresta → o quanto ela se afasta da reta, em unidades do `viewBox`.
 *
 * Duas causas somam. A aresta que pula faixa precisa contornar a caixa do meio,
 * então o desvio parte da largura de uma caixa. E arestas REPETIDAS entre o
 * mesmo par (`A-->|faz| B` e `A-->|devolve| B`) sairiam uma exatamente em cima
 * da outra, com os dois rótulos empilhados no mesmo pixel; cada repetição ganha
 * um degrau a mais. O valor é o do ponto de controle — a curva chega à metade
 * dele, que é o que precisa passar da borda do nó.
 */
function detourOf(graph: MermaidGraph, laneOf: Map<number, number>, crossSize: number) {
  const laneOfNode = new Map(graph.nodes.map((n) => [n.id, laneOf.get(n.rank)!]));
  const seen = new Map<string, number>();
  const detours = new Map<number, number>();

  graph.edges.forEach((edge, i) => {
    if (edge.from === edge.to) return;
    const pair = [edge.from, edge.to].sort().join(' ');
    const repeat = seen.get(pair) ?? 0;
    seen.set(pair, repeat + 1);

    const from = laneOfNode.get(edge.from);
    const to = laneOfNode.get(edge.to);
    const skips = from !== undefined && to !== undefined && Math.abs(to - from) > 1;
    const detour = 2 * ((skips ? crossSize / 2 + 16 : 0) + repeat * 22);
    if (detour > 0) detours.set(i, detour);
  });

  return detours;
}

const center = (box: PlacedNode) => ({ x: box.x + NODE_W / 2, y: box.y + NODE_H / 2 });

/**
 * O ponto onde a reta rumo a `toward` corta a borda de `box`, mais uma folga.
 *
 * Sair do centro sem cortar faria a seta atravessar as duas caixas e a ponta
 * sumir por baixo do retângulo de destino. Numa aresta arqueada o alvo é o ponto
 * de CONTROLE, não o outro nó: é ele que dá a tangente da curva, e mirar no nó
 * deixaria a ponta encostando de lado.
 */
function borderPoint(box: PlacedNode, toward: { x: number; y: number }, gap: number) {
  const { x: cx, y: cy } = center(box);
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const scale = Math.min(
    dx === 0 ? Infinity : NODE_W / 2 / Math.abs(dx),
    dy === 0 ? Infinity : NODE_H / 2 / Math.abs(dy),
  );
  const t = scale + gap / Math.hypot(dx, dy);

  return { x: cx + dx * t, y: cy + dy * t };
}
