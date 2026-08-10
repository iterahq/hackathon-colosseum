/**
 * O que está NA TELA do aluno agora, em memória e só em memória.
 *
 * O palco lia o trabalho do aluno pelo `codeSnapshot.service`, cuja escrita é
 * debounced E travada até a primeira tecla — de propósito: um snapshot afirma
 * "existe trabalho aqui", e um starter intocado não é trabalho. Consequência
 * medida na aula de 06/08: quem abriu o exercício e não digitou respondia ao
 * puxão do professor com nada, e a turma via o placeholder. O professor teve que
 * pedir pro aluno "mexer em algo" antes de puxar.
 *
 * PUBLICAR NÃO É PERSISTIR, e é isso que resolve o dilema. Nada aqui sobrevive a
 * um reload, então o starter intocado pode ser PROJETADO sem também ser
 * RESTAURADO (o que fixaria um starter velho por cima do autorado) e sem afirmar
 * que o aluno está "em andamento" — quem separa as duas coisas é o `hasWork`.
 *
 * Consequência de ser volátil: aba fechada = buffer sumiu, e aí o palco cai no
 * snapshot. Enquanto o editor está montado o buffer NUNCA é mais velho que o
 * snapshot, porque é dele que o editor semeia.
 *
 * Padrão do projeto: módulo puro, sem React. E sem `CustomEvent`: o
 * `CODE_SNAPSHOT_EVENT` é o sinal de presença "tem trabalho em andamento" que a
 * página do ao-vivo escuta, e disparar por buffer intocado voltaria a anunciar
 * como trabalhando quem só abriu a tela.
 */
import type { CodeLiveBuffer } from '@/types/codeSnack';

export type { CodeLiveBuffer } from '@/types/codeSnack';

/**
 * Por `activityId`, não por aluno: o mapa vive na aba do próprio aluno. Não
 * precisa do `storageScope` por isso mesmo — nada é gravado no disco da máquina
 * compartilhada, que é o vazamento que aquele escopo existe pra fechar.
 */
const buffers = new Map<string, CodeLiveBuffer>();

export function publishCodeLiveBuffer(activityId: string, code: string, hasWork: boolean): void {
  if (!activityId) return;
  buffers.set(activityId, { code, hasWork });
}

export function readCodeLiveBuffer(activityId: string): CodeLiveBuffer | null {
  if (!activityId) return null;
  return buffers.get(activityId) ?? null;
}

/**
 * Chamado quando o editor desmonta ou troca de atividade. Sem isso o palco
 * projetaria o último código de uma atividade que o aluno já deixou — e o
 * professor não teria como saber que está olhando pra uma tela que não existe
 * mais.
 */
export function forgetCodeLiveBuffer(activityId: string): void {
  if (!activityId) return;
  buffers.delete(activityId);
}
