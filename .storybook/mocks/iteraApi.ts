/**
 * A itera-api FALSA do Storybook.
 *
 * O `.storybook/main.ts` resolve `@/api/iteraApi` para cá — só na vitrine, nunca
 * no app. O motivo é o BYOC ao vivo: `useSandboxScenarioLive` importa `respond`
 * e `judge` direto do módulo, então sem isto a vitrine não tinha caminho nenhum
 * para o fluxo completo. `VITE_ITERA_API_BASE` não é setado no build da vitrine,
 * então as duas chamadas lançavam na hora e a story mostrava a DEGRADAÇÃO
 * ("a IA está indisponível") em vez do fluxo — o dev via um estado de erro
 * achando que estava vendo a atividade.
 *
 * Ligar IA de verdade aqui seria complexidade à toa: o valor da vitrine é o
 * contrato visual e as fases, não a geração. O que a fase de resposta precisa
 * ter na tela é ESPERA e depois TEXTO, e disso um relógio local dá conta.
 *
 * `iteraApiConfigured` NÃO é sobrescrita de propósito: ela continua devolvendo
 * `false`, que é o que o resto da vitrine já assume hoje. Sobrescrever ligaria
 * caminho de IA em stories que nada têm a ver com isto (`ai-judge` do document,
 * roteamento do `LiveActivityRenderer`, diagnóstico de autoria do BYOC).
 */
export * from '../../src/api/iteraApi';
import type { JudgeVerdict, RespondResult } from '../../src/api/iteraApi';

const LATENCIA_MS = 1200;

const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCIA_MS));

/**
 * `context_good` vem TRUE porque a story existe para mostrar o caminho feliz. O
 * contexto ruim tem prova própria em `src/test/SandboxScenarioLive.test.tsx`,
 * que cobre as quatro combinações de nota × verdade.
 */
export function respond(input: string): Promise<RespondResult> {
  return delay({
    response: `Resposta simulada da vitrine para: "${input.slice(0, 80)}". Em produção este texto vem do modelo, pelo /v1/embed/respond.`,
    model: 'storybook-mock',
    responder_available: true,
    context_good: true,
    reason: 'O contexto trouxe quem pede, para quê e em que formato — dá para responder sem chutar.',
  });
}

export function judge(activityId: string): Promise<JudgeVerdict> {
  return delay({
    result_id: 'storybook-mock',
    activity_id: activityId,
    attempt: 1,
    status: 'passed',
    passed: true,
    score: 1,
    feedback: 'Avaliação simulada da vitrine.',
    criteria: [],
    model: 'storybook-mock',
    progress_status: 'completed',
    judge_available: true,
  });
}
