/**
 * O desenho autorado, medido contra o parser e o renderer de verdade.
 *
 * `diagramMermaidRender.test.tsx` prova o COMPORTAMENTO do renderer com fontes
 * inventadas. Aqui a pergunta é outra e mais rasteira: a fonte que está no banco,
 * na aula que a turma abre amanhã, ainda desenha? É a checagem que nenhum teste
 * de unidade faz, porque o conteúdo mora fora do código.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { normalizeMermaidLabel, parseMermaidLite, type DiagramSpec } from '@iterahq/activities';
import { safeParseActivitySpec } from '@iterahq/activity-spec';
import { DiagramActivity } from '@/components/branded/activity/DiagramActivity';
import { personalizeSpec } from '@/utils/personalization';
import { resolveLocalizedSpec } from '@/utils/resolveLocalizedSpec';
import { AUTHORED_DIAGRAMS } from './fixtures/authoredDiagrams';
import type { Activity } from '@/types/content';

/**
 * A MESMA ordem do app, e a ordem importa: o serviço achata os `{pt,en}`
 * (`programs.service.ts:228`) e só depois o hook substitui os `{{tokens}}`
 * (`usePersonalizedActivity`). Achatar depois deixaria um token dentro de um
 * saco bilíngue — e o `DiagramActivity` renderiza `highlight.term` cru no DOM,
 * então um saco chegando ali é React #31, tela vermelha.
 */
const comoOAlunoRecebe = (spec: unknown, elenco: Record<string, string>) =>
  personalizeSpec(
    resolveLocalizedSpec(spec as Record<string, unknown>) as unknown as DiagramSpec,
    elenco,
  );

/**
 * O elenco VAZIO é o aluno que pulou o formulário de personalização: cai nos
 * nomes de fallback. O elenco com acento e nome composto é o caso comum de
 * verdade numa sala brasileira, e é ele que estica o rótulo dentro da caixa.
 */
const ELENCOS: Record<string, Record<string, string>> = {
  'sem personalização': {},
  'nome composto e acentuado': {
    'eu.nome': 'José Antônio',
    'familiar.nome': 'Conceição',
    'amigo.nome': 'Müller',
  },
};

describe.each(AUTHORED_DIAGRAMS)('diagram autorado — $slug', ({ spec }) => {
  it('passa pelo schema publicado', () => {
    expect(safeParseActivitySpec('diagram', spec).success).toBe(true);
  });

  describe.each(Object.entries(ELENCOS))('com %s', (_nome, elenco) => {
    const personalizado = comoOAlunoRecebe(spec, elenco);

    it('continua dentro do subconjunto que o parser desenha', () => {
      expect(parseMermaidLite(personalizado.mermaid)).not.toBeNull();
    });

    it('tem um nó para cada `highlight.term`', () => {
      const rotulos = parseMermaidLite(personalizado.mermaid)!.nodes.map((n) =>
        normalizeMermaidLabel(n.label),
      );

      for (const { term } of personalizado.highlights ?? []) {
        expect(rotulos).toContain(normalizeMermaidLabel(term));
      }
    });

    it('sai como SVG, e todo chip vira botão', () => {
      render(
        <DiagramActivity
          activity={
            {
              id: 'a1',
              kind: 'diagram',
              spec: personalizado,
              status: 'todo',
            } as unknown as Activity
          }
          onComplete={() => {}}
        />,
      );

      expect(screen.getByTestId('mermaid-lite')).toBeInTheDocument();
      expect(screen.queryByTestId('diagram-mermaid-source')).toBeNull();

      const chips = within(screen.getByTestId('diagram-highlights'));
      expect(chips.getAllByRole('button')).toHaveLength(personalizado.highlights!.length);
    });
  });
});
