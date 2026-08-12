import { useEffect } from 'react';
import { touchClassSessionHeartbeat } from '@/services/liveClass.service';

/**
 * Enquanto o console do professor está aberto numa aula `live`, ele carimba
 * `class_sessions.heartbeat_at`. É o que impede o reaper de ociosidade
 * (`itera.reap_stale_class_sessions`, 30 min) de encerrar uma aula em que o
 * professor está explicando — o caso real de 10/08, em que a sessão morreu
 * sozinha com a turma na frente da tela.
 *
 * O intervalo é folgado de propósito: o prazo do reaper é de meia hora, então
 * batimento a cada 4 minutos sobrevive a aba em segundo plano (o navegador
 * estrangula timer de aba oculta para ~1/min) com margem enorme, e custa uns
 * quinze UPDATEs por hora de aula.
 */
const HEARTBEAT_MS = 4 * 60 * 1000;

export function useClassHeartbeat(sessionId: string | undefined, live: boolean) {
  useEffect(() => {
    if (!sessionId || !live) return;
    // Sem batida imediata: a sessão acabou de ser lida como `live`, então
    // `started_at` (ou o batimento anterior) ainda está fresco.
    const id = setInterval(() => void touchClassSessionHeartbeat(sessionId), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [sessionId, live]);
}
