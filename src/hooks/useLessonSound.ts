import { useCallback } from 'react';
import { useSoundEffects } from './useSoundEffects';
import { useLessonMuted } from './useLessonMuted';

/**
 * Sound cues of the self-paced lesson.
 *
 * Não lê `useLiveVolume` de propósito: essa preferência é do slider da aula ao
 * vivo, e a lição só tem um botão de mudo. Um aluno que arrastou o slider pra 0
 * ao vivo ficaria com a lição muda sem nada na tela pra reverter — o ícone
 * dizendo "som ligado" e nenhum som saindo. Níveis fixos aqui.
 */
export function useLessonSound() {
  const { play } = useSoundEffects();
  const [muted, toggleMuted] = useLessonMuted();

  const onSettle = useCallback(
    (correct: boolean) => {
      if (muted) return;
      play(correct ? 'success' : 'error', correct ? 0.4 : 0.3);
    },
    [muted, play]
  );

  const onAdvance = useCallback(() => {
    if (!muted) play('click', 0.2);
  }, [muted, play]);

  const onFinish = useCallback(() => {
    if (!muted) play('celebration', 0.5);
  }, [muted, play]);

  return { muted, toggleMuted, onSettle, onAdvance, onFinish };
}
