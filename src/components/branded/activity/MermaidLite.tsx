/**
 * `MermaidLite` mora em `@iterahq/activities` — este arquivo é só o caminho de
 * import do app, no mesmo padrão do `JudgeHeatmap`.
 *
 * Ele sai do pacote e não do app porque quem desenha é o `DiagramActivity`, que
 * já foi extraído: manter o renderer lá e o desenho aqui obrigaria o pacote a
 * pedir o SVG por porta injetada, e um consumidor externo veria o `<pre>` cru
 * onde o Player vê o diagrama.
 */
export { MermaidLite } from '@iterahq/activities';
export type { MermaidLiteProps } from '@iterahq/activities';
