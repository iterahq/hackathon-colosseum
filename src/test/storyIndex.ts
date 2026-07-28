/**
 * Índice das stories canônicas (`src/**`), compartilhado pelos dois testes da
 * Fase 2 do plano `20260728-itera-activity-testing`:
 *
 *   - `storyRenderSmoke.test.tsx`      — T2: monta TODAS elas (o "nunca quebra");
 *   - `activityMatrixCoverage.test.ts` — V3: prova que cada célula obrigatória
 *     da matriz de estados aponta para uma story que EXISTE.
 *
 * A enumeração é por `import.meta.glob`, nunca à mão — é isso que faz story nova
 * entrar sozinha no smoke e story renomeada quebrar o guard de matriz.
 *
 * ESCOPO: só `src/**`. `design-playground/**` (o outro glob de
 * `.storybook/main.ts`) é o espaço de brainstorm do designer — ver "Story/
 * Component ownership" no CLAUDE.md deste repo: johnoak publica lá sem gate de
 * review, então transformar aquele diretório em gate de CI dos desenvolvedores
 * inverteria a regra de ownership. Ele segue coberto pelo `build-storybook`.
 *
 * ⚠️ `setProjectAnnotations` roda no TOPO deste módulo, e `indexStories()` só
 * compõe quando é CHAMADA. A ordem importa: um `composeStories()` disparado
 * antes das annotations perderia os decorators globais do preview (MemoryRouter
 * + AuthProvider + I18nProvider + shell de tema) e o smoke passaria a testar uma
 * árvore que ninguém renderiza de verdade.
 */
import type { ComponentType } from 'react';
import { composeStories, setProjectAnnotations } from '@storybook/react';
import previewAnnotations from '../../.storybook/preview';

setProjectAnnotations([previewAnnotations]);

type StoryModule = Parameters<typeof composeStories>[0];

const storyModules = import.meta.glob<StoryModule>(
  ['../**/*.stories.ts', '../**/*.stories.tsx'],
  { eager: true },
);

export interface IndexedStory {
  /** O id real do Storybook (ex.: `activities-escolha-quiz--verdadeiro-ou-falso`). */
  id: string;
  /** Caminho do arquivo — só para a mensagem de erro ser acionável. */
  file: string;
  exportName: string;
  Component: ComponentType;
}

let cache: IndexedStory[] | null = null;

export function indexStories(): IndexedStory[] {
  if (cache) return cache;
  const out: IndexedStory[] = [];
  for (const [file, mod] of Object.entries(storyModules)) {
    const composed = composeStories(mod);
    for (const [exportName, Story] of Object.entries(composed)) {
      const id = (Story as unknown as { id?: string }).id ?? `${file}--${exportName}`;
      out.push({ id, file, exportName, Component: Story as unknown as ComponentType });
    }
  }
  cache = out;
  return out;
}
