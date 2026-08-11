/**
 * A porta de personalização que a árvore de atividades enxerga — React puro,
 * sem Supabase e sem service.
 *
 * Mora separado do provider de propósito: o `ActivityTestHarness` monta os
 * MESMOS renderers que o aluno vê, e é a ausência de import de escrita ali que
 * garante que o autor testando atividade não toca dado de aluno
 * (`src/test/traceEmissionBoundary.test.ts`). Se o renderer importasse o
 * provider, importaria o cliente do Supabase junto.
 *
 * Com a porta DESLIGADA nada é pedido a ninguém e o texto sai com o fallback do
 * campo — é o que faz story e harness renderizarem "a Ana" em vez de um
 * formulário. ⚠️ O default do contexto NÃO basta para o harness: o provider
 * envolve todas as rotas, e o autor está DENTRO delas. Quem monta atividade em
 * superfície de autoria empurra `PERSONALIZATION_OFF` na mão, ou pergunta ao
 * autor o nome da mãe dele e grava na conta dele.
 */
import { createContext, useContext } from 'react';
import type { PersonalizationPort } from '@/types/personalization';

export const PERSONALIZATION_OFF: PersonalizationPort = {
  values: {},
  ready: false,
  mayAsk: false,
  save: async () => {},
  dismiss: () => {},
};

export const PersonalizationContext = createContext<PersonalizationPort>(PERSONALIZATION_OFF);

export function usePersonalization(): PersonalizationPort {
  return useContext(PersonalizationContext);
}
