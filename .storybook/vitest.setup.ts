/**
 * Setup do projeto Vitest de BROWSER MODE (ADR-8), usado só por
 * `vitest.browser.config.ts`.
 *
 * Ele registra as annotations globais do preview — os mesmos decorators
 * (MemoryRouter + AuthProvider + I18nProvider + shell de tema) que o canvas do
 * Storybook aplica. Sem isso, a story rodaria numa árvore que ninguém renderiza
 * de verdade, e o teste de browser estaria provando uma coisa diferente da que
 * o Tainan vê quando abre o `storybook.iterahq.dev`.
 *
 * É o irmão de `src/test/storyIndex.ts`, que faz a mesma coisa no lado jsdom.
 */
import { beforeAll } from 'vitest';
import { setProjectAnnotations } from '@storybook/react-vite';
import * as previewAnnotations from './preview';

const project = setProjectAnnotations([previewAnnotations]);

beforeAll(project.beforeAll);
