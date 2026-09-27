import type { ActivityKind } from '@/types/content';
import { ACTIVITY_FAMILY } from './activityFamilies';

/**
 * O texto de resposta que PODE ir pro palco.
 *
 * Só resposta fechada (alternativa marcada, pares ligados, ordem montada). A
 * reflexão escrita do `document` também produz `response`, mas é um texto
 * pessoal endereçado ao professor — projetar isso na parede pra turma é outro
 * produto, e ninguém pediu.
 *
 * O teto existe porque a string atravessa um broadcast e termina renderizada
 * num projetor: sem ele, um texto colado quebra o card e ocupa a banda da sala.
 */
const STAGE_RESPONSE_MAX = 280;

export function stageResponseText(
  kind: ActivityKind | string | undefined,
  response: unknown
): string | undefined {
  if (typeof response !== 'string') return undefined;
  const family = ACTIVITY_FAMILY[kind as ActivityKind];
  if (family !== 'selection' && family !== 'arrangement') return undefined;
  return clampStageResponse(response);
}

/** Teto aplicado de novo na borda de leitura: a string chega pela rede. */
export function clampStageResponse(response: unknown): string | undefined {
  if (typeof response !== 'string') return undefined;
  const trimmed = response.trim();
  if (!trimmed) return undefined;
  return trimmed.length > STAGE_RESPONSE_MAX ? `${trimmed.slice(0, STAGE_RESPONSE_MAX)}…` : trimmed;
}
