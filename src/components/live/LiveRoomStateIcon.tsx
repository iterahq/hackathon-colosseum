import { CheckCircle2, Circle, Pencil, XCircle } from 'lucide-react';
import type { ClassAnswerState } from '@/types/liveClass';

/**
 * How one row reports on the CURRENT activity.
 *
 * `showDetail` is the professor's view: só ele vê o X do erro. `working` é o
 * estado do meio, também só dele: o aluno tem trabalho local e não submeteu,
 * que é exatamente quem ele quer puxar pro palco.
 *
 * ⚠️ Na tela do ALUNO um erro NÃO é mais check verde — é check CINZA (Tainan
 * 2026-08-06: "acho que pode ser até check icon / mas cinza / pq o cara nao
 * acertou / senao criamos um mundo de cor de rosa"). Isso afrouxa de propósito
 * a decisão da aula 1 ("Opção A", correção 100% invisível para a turma): o
 * verde para quem errou não era discrição, era a lista afirmando que a turma
 * toda tinha acertado. O que continua fora da tela do aluno é o X — ninguém é
 * apontado como errado, só deixa de ganhar o verde.
 */
export function LiveRoomStateIcon({
  state,
  working = false,
  showDetail = false,
}: {
  state: ClassAnswerState;
  working?: boolean;
  showDetail?: boolean;
}) {
  if (state === 'done') {
    return <CheckCircle2 className="w-4 h-4 text-menta" data-testid="live-room-state" data-variant="done" />;
  }
  if (state === 'wrong') {
    return showDetail ? (
      <XCircle className="w-4 h-4 text-destructive/90" data-testid="live-room-state" data-variant="wrong" />
    ) : (
      <CheckCircle2
        className="w-4 h-4 text-muted-foreground/60"
        data-testid="live-room-state"
        data-variant="missed"
      />
    );
  }
  if (working) return <Pencil className="w-3.5 h-3.5 text-clay" data-testid="live-room-working" />;
  return (
    <Circle
      className="w-3.5 h-3.5 text-muted-foreground/40"
      data-testid="live-room-state"
      data-variant="pending"
    />
  );
}
