/**
 * useClassSession — the real-time synchronicity layer for a live cohort class.
 *
 * TWO PRIVATE Supabase Realtime topics, both gated by realtime.messages RLS:
 *   `class:<sessionId>`      — participants read + send (migration 0022).
 *   `class:<sessionId>:ctrl` — participants read, only class STAFF send
 *                              (migration 0023). Every instructor-driven event
 *                              (advance, timer, stage) rides here, so a learner
 *                              can no longer forge one.
 * Between them they carry three concerns:
 *   1. broadcast  — the FAST path. The professor broadcasts `{ current_activity_id }`
 *      on advance; every student re-points instantly (no DB round-trip).
 *   2. postgres_changes — the DURABLE / reconnect truth. We also subscribe to the
 *      itera.class_sessions row so a late-joiner / reconnecting client converges to
 *      the authoritative pointer + status even if it missed the broadcast.
 *   3. presence  — the live roster (who's in the room right now).
 *
 * The hook is shared by students (read + presence) and the professor (who ALSO
 * calls `broadcast()` on advance). Its only DB write is the moderation one
 * (remove, via classModeration.service), which is durable on purpose;
 * the class pointer is persisted by the professor page via
 * liveClass.service.advanceClassSession (durable) THEN broadcast() (fast).
 * Result writes stay elsewhere (LessonPlayer / progress.service).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getClassSession, mapSession, type ClassSession } from '@/services/liveClass.service';
import type {
  ClassIdentity as Identity,
  ClassPresenceMember,
  ClassTimer,
  StageClick,
  StageCursor,
  StageCursorCaret,
  StageCursorFrame,
  StagedAnswer,
  UseClassSession,
} from '@/types/liveClass';
import { stageCursorPlan } from '@/utils/stageCursorRate';
import { parseTimerEvent, timerAfterStop } from '@/utils/liveTimer';
import { reconnectDelayMs } from '@/utils/liveReconnect';
import { gatherStageContent, parseStageStatus } from '@/utils/stageAnswerContent';
import { clampStageResponse } from '@/utils/stageResponseText';
import { parseStageTerminal } from '@/utils/stageTerminalScreen';
import { parseStageChat } from '@/utils/stageChatScreen';
import { acceptPanePx } from '@/utils/stageCursorPlacement';
import {
  parseScoreboard,
  SCOREBOARD_MAX_ENTRIES,
  SCOREBOARD_REPLY_DEBOUNCE_MS,
  SCOREBOARD_REPLY_MIN_GAP_MS,
} from '@/utils/liveScoreboard';
import { CODE_SNAPSHOT_EVENT } from '@/services/codeSnapshot.service';
import { TERMINAL_LIVE_EVENT } from '@/services/terminalLiveBuffer.service';
import { CHAT_LIVE_EVENT } from '@/services/chatLiveBuffer.service';
import { amIRemovedFrom, removeFromClass } from '@/services/classModeration.service';
import { getSessionScoreboard } from '@/services/classScoreboard.service';

export type { ClassPresenceMember, UseClassSession } from '@/types/liveClass';

const ADVANCE_EVENT = 'advance';
const ANSWERED_EVENT = 'answered';
const TIMER_EVENT = 'timer';
const TIMER_STOP_EVENT = 'timer-stop';
// "Pull to stage" (ADR-3/4): request → student replies → instructor gates → all
// render. The request rides the CONTROL topic, so only staff can ask for a
// learner's work; the reply rides the shared topic, where it discloses nothing
// the resulting stage-show would not publish to the class anyway. The nonce +
// target echo below reject STALE/MISMATCHED replies.
const STAGE_REQUEST_EVENT = 'stage-request';
const STAGE_ANSWER_EVENT = 'stage-answer';
const STAGE_SHOW_EVENT = 'stage-show';
const STAGE_CLEAR_EVENT = 'stage-clear';
// After a pull resolves, the staged learner keeps streaming its work while it
// edits (live stage). It re-emits stage-update on every autosave; the instructor
// forwards those as fresh stage-show. Same trust model as the one-shot pull —
// gated on the resolved (userId + activityId) target, not a fresh nonce.
const STAGE_UPDATE_EVENT = 'stage-update';
// Ações do professor sobre um aluno. `kick` só AVISA — a verdade está em
// itera.class_removals, cuja RLS exige staff da aula, e é dela que todo cliente
// re-hidrata ao (re)entrar. `hand-lower` não tem verdade durável nenhuma: a mão
// vive em presença, que só o dono escreve, então é sempre um PEDIDO ao cliente
// do aluno.
const KICK_EVENT = 'kick';
const HAND_LOWER_EVENT = 'hand-lower';
// Pausa para dúvidas: a turma para de olhar a atividade e olha o professor. Vai
// no tópico de staff (0023) porque só o professor decide quando a aula para —
// um aluno não pode congelar a sala dos outros. Não trava resposta nenhuma: é
// sinalização, e quem já estava digitando termina.
const BREAK_EVENT = 'break';
// Placar: PEDIDO no tópico compartilhado (é onde o aluno pode enviar), RESPOSTA
// no de staff. Diferente do `answered`, que é auto-atestado por design, a
// resposta fala pelos OUTROS — no tópico compartilhado um aluno reescreveria o
// pódio da turma. Quem pede é quem acabou de conectar, porque é ele que sabe que
// está sem placar. Ver `utils/liveScoreboard.ts` pro defeito que isso corrige.
const SCOREBOARD_REQUEST_EVENT = 'scoreboard-request';
const SCOREBOARD_EVENT = 'scoreboard';
// The pull is peer-to-peer: only a client that is ONLINE can answer it. A learner
// who closed the tab / lost the network never replies, so give up after a grace
// window and tell the professor — an endless spinner reads as a broken feature.
const STAGE_REPLY_TIMEOUT_MS = 6000;
// Cursor mirror (plan 20260728-…, Fases 2/3) rides a THIRD topic of its own:
// `class:<id>:cursor`. Not a new event on an existing topic, because the two
// have incompatible cadences — `stage-update` is debounced at 600ms on purpose
// and the cursor moves on every pointer sample. Merged, either the autosave
// thickens or the cursor stutters. A separate topic also means a cursor flood
// can never crowd out `advance` / `timer` / `stage-show`, which are the events
// the class actually cannot lose.
//
// ⚠️ Needs migration 0036: 0023 made the participant-send policy an ALLOWLIST
// (`split_part(topic, ':', 3) = ''`), so a sibling topic is readable but
// unwritable until it opts in. Until 0036 is applied the sends are refused and
// the mirror simply never appears — the stage itself is untouched.
const STAGE_CURSOR_EVENT = 'stage-cursor';
// O caminho INVERSO, no MESMO tópico: quem emite é o professor e quem assiste é
// a turma (inclusive o aluno no palco). Evento separado, e não uma flag no
// `stage-cursor`, porque os dois ponteiros coexistem na tela — um `payload` só
// faria o cursor do professor sobrescrever o do aluno a cada frame.
const INSTRUCTOR_CURSOR_EVENT = 'instructor-cursor';
const cursorTopic = (sessionId: string) => `class:${sessionId}:cursor`;

export function useClassSession(
  sessionId: string | undefined,
  identity?: Identity
): UseClassSession {
  const [session, setSession] = useState<ClassSession | null>(null);
  const [currentActivityId, setCurrentActivityId] = useState<string | null>(null);
  const [status, setStatus] = useState<ClassSession['status'] | null>(null);
  const [roster, setRoster] = useState<ClassPresenceMember[]>([]);
  const [connected, setConnected] = useState(false);
  // Presence lives on the SHARED topic only, so it must re-track as soon as THAT
  // one is up — a control-topic outage can't be allowed to make a learner
  // invisible in the professor's roster.
  const [sharedConnected, setSharedConnected] = useState(false);
  // True while a previously-joined channel is down and being rebuilt (drives
  // the "reconnecting…" banner). Never true before the FIRST successful join.
  const [reconnecting, setReconnecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, Record<string, boolean>>>({});
  const [elapsed, setElapsed] = useState<Record<string, Record<string, number>>>({});
  // `activityId|userId` de quem já ACERTOU: marca o tempo como definitivo. Não é
  // estado porque ninguém renderiza a marca — ela só decide se o próximo tempo
  // entra (ver `recordAnswer`).
  const settledTimeRef = useRef<Set<string>>(new Set());
  const [timer, setTimer] = useState<ClassTimer | null>(null);
  // O cronômetro só existe em broadcast, e broadcast não se repete. Numa aula
  // `timer_gated` isso trava de verdade: quem reconecta ou chega atrasado fica
  // sem `timerRunning` e o portão o deixa read-only pela rodada inteira. O ref
  // é o que deixa o professor devolver o prazo junto do placar.
  const timerRef = useRef<ClassTimer | null>(null);
  timerRef.current = timer;
  // The activity whose timer was just STOPPED by the professor — cue to reveal
  // the correct answer to everyone. Cleared on advance.
  const [stoppedFor, setStoppedFor] = useState<string | null>(null);
  const [stagedAnswer, setStagedAnswer] = useState<StagedAnswer | null>(null);
  // Instructor-side UX for the in-flight pull: who we're waiting on, and who we
  // gave up on (see STAGE_REPLY_TIMEOUT_MS).
  const [stagePendingUserId, setStagePendingUserId] = useState<string | null>(null);
  const [stageUnreachableUserId, setStageUnreachableUserId] = useState<string | null>(null);
  // Latest cursor frame from whoever is on stage (see the cursor topic below).
  const [stageCursor, setStageCursor] = useState<StageCursor | null>(null);
  // O caminho INVERSO (K1): o ponteiro do professor sobre o palco, desenhado na
  // tela de quem assiste — inclusive na do aluno que está no palco.
  const [instructorCursor, setInstructorCursor] = useState<StageCursor | null>(null);
  const [instructorClick, setInstructorClick] = useState<StageClick | null>(null);
  const [onBreak, setOnBreak] = useState(false);
  // Lido na sincronização de presença: quem entra no meio da pausa não ouviu o
  // broadcast que a abriu, então o professor a reanuncia quando alguém chega.
  const onBreakRef = useRef(false);
  onBreakRef.current = onBreak;
  const [removed, setRemoved] = useState(false);
  // Lido dentro do efeito do canal (que só depende de sessionId) para impedir
  // que o retry fique tentando reentrar num canal cuja RLS já nega o JOIN.
  const removedRef = useRef(false);
  // A mão é UM estado só. Antes o hook guardava o ref (para a presença) e a
  // página guardava um useState paralelo — o que ficava mentindo assim que a
  // mão descia por qualquer caminho que não fosse o botão do próprio aluno.
  const [handRaised, setHandRaisedState] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // The staff-write topic (migration 0023) — every instructor-driven send.
  const ctrlRef = useRef<RealtimeChannel | null>(null);
  // The instructor's in-flight pull: the nonce armed by requestStage + which
  // learner it targeted. A stage-answer is only gated to stage-show when BOTH
  // the userId matches the target AND the nonce echoes back (rejects stale replies).
  const pendingStageRef = useRef<{ nonce: string; targetUserId: string } | null>(null);
  const stageTimeoutRef = useRef<number | null>(null);
  // Instructor side: the learner currently ON the live stage (after a pull
  // resolved). Kept so their streamed stage-update pushes keep being forwarded
  // as stage-show until the pull is cleared or the class advances.
  const liveStageRef = useRef<{ targetUserId: string; activityId: string } | null>(null);
  // Learner side: the activity this client is itself staged for (its own work is
  // on the class stage). Drives the autosave→stage-update stream below.
  const stagedSelfRef = useRef<string | null>(null);
  // Learner side: the activity this client actually answered a pull for. A
  // stage-show is peer-forgeable, so self-streaming only arms when we replied to
  // a real stage-request first — a bare forged stage-show can't make us stream.
  const answeredStageRef = useRef<string | null>(null);
  // Read inside broadcast handlers so a stage-show is only honored for the CURRENT
  // activity — without making the channel effect depend on currentActivityId.
  const currentActivityIdRef = useRef<string | null>(null);
  currentActivityIdRef.current = currentActivityId;
  const sessionIdRef = useRef<string | undefined>(sessionId);
  sessionIdRef.current = sessionId;
  // Latest identity, read inside the channel effect / track without making the
  // channel re-subscribe when identity resolves late (which reused a still-
  // joined channel → `.on()`-after-`subscribe()` crash — see the effect below).
  const identityRef = useRef<Identity | undefined>(identity);
  identityRef.current = identity;
  // Presence is re-tracked wholesale, so the hand state must ride along on every
  // track() (identity refresh, reconnect) — not just the explicit toggle. Same
  // for the activity the learner has started working on.
  const handRaisedRef = useRef(false);
  const workingOnRef = useRef<string | null>(null);
  // Cursor topic: its own channel, joined only while there IS a stage (ADR-3 —
  // fan-out is what costs, so nobody subscribes to a stream nobody is watching).
  const cursorRef = useRef<RealtimeChannel | null>(null);
  // Who is allowed to move the mirrored cursor right now. Read inside the
  // broadcast handler so a frame naming anyone else is dropped without making
  // the channel effect depend on `stagedAnswer` (which changes on every autosave
  // forward and would re-subscribe the topic ~1.7×/s).
  const stageAuthorRef = useRef<string | null>(null);
  stageAuthorRef.current = stagedAnswer?.author.userId ?? null;
  const stageCursorTsRef = useRef(0);
  // Quem pode mover o cursor do PROFESSOR, lido da linha do banco (ver o
  // handler): a presença é auto-declarada e por isso não serve de prova.
  const instructorIdRef = useRef<string | null>(null);
  instructorIdRef.current = session?.instructorId ?? null;
  const instructorCursorTsRef = useRef(0);

  const trackPresence = useCallback(() => {
    const channel = channelRef.current;
    const id = identityRef.current;
    if (!channel || !id) return;
    void channel.track({
      user_id: id.userId,
      name: id.name,
      avatar_url: id.avatarUrl ?? null,
      is_instructor: id.isInstructor === true,
      // Link-invited guest (ADR-9/ADR-11) — every surface that renders a roster
      // row reads this to draw the guest badge.
      is_guest: id.isGuest === true,
      hand_raised: handRaisedRef.current,
      working_on: workingOnRef.current,
      at: new Date().toISOString(),
    });
  }, []);

  // `answered` is the one event a learner still sends, so it is self-attested:
  // the scoreboard it feeds is DECORATION and itera.class_answers (RLS: a learner
  // writes only its own row) stays the durable truth. Recording is MONOTONE — a
  // hit never flips to a miss and the time of a hit is never rewritten — so a
  // forged event can't sabotage a peer.
  const recordAnswer = useCallback(
    (activityId: string, userId: string, correct: boolean, elapsedMs?: number) => {
      setAnswers((prev) => {
        const known = prev[activityId]?.[userId];
        // Repetição é no-op de IDENTIDADE, não só de valor: uma resposta de placar
        // repete dezenas de entradas que o cliente já tem, e devolver objeto novo
        // re-renderizaria pódio e roster inteiros por nada.
        if (known === correct || (known === true && !correct)) return prev;
        return { ...prev, [activityId]: { ...(prev[activityId] ?? {}), [userId]: correct } };
      });
      if (typeof elapsedMs !== 'number') return;
      // O tempo de um ERRO é PROVISÓRIO. O professor precisa ver quanto o aluno
      // levou mesmo errando — antes disso a linha de quem errou não tinha tempo
      // nenhum, indistinguível de quem não respondeu, e o `totalMs` dele no
      // pódio era 0, que como desempate valeria "o mais rápido da turma".
      // Um acerto posterior SUBSTITUI o provisório, porque o desempate é
      // tempo-até-acertar; depois disso o tempo congela, e é esse congelamento
      // que o replay de placar (SCOREBOARD_EVENT) chama de monótono.
      const key = `${activityId}|${userId}`;
      if (settledTimeRef.current.has(key)) return;
      if (correct) settledTimeRef.current.add(key);
      setElapsed((prev) => {
        if (prev[activityId]?.[userId] === elapsedMs) return prev;
        return { ...prev, [activityId]: { ...(prev[activityId] ?? {}), [userId]: elapsedMs } };
      });
    },
    []
  );

  // Clears the "waiting for the peer's reply" timer without touching the nonce
  // gate — used by every path that ends a pull (reply, clear, advance, unmount).
  const clearStageTimeout = useCallback(() => {
    if (stageTimeoutRef.current === null) return;
    clearTimeout(stageTimeoutRef.current);
    stageTimeoutRef.current = null;
  }, []);

  const applySession = useCallback((s: ClassSession | null) => {
    if (!s) return;
    setSession(s);
    setCurrentActivityId(s.currentActivityId);
    setStatus(s.status);
  }, []);

  // Avançar É retomar: ninguém segue em pausa numa atividade nova. Fica num
  // efeito sobre o PONTEIRO, e não dentro do handler do `advance`, porque quem
  // reconecta depois de uma queda recebe o avanço pela linha durável
  // (postgres_changes / refetch) — o broadcast não é reprisado, e pelo handler
  // esse aluno voltaria com o card de pausa preso numa atividade que já virou.
  //
  // A PRIMEIRA transição (`null` → id) NÃO é avanço, é o read inicial chegando:
  // limpar ali apaga a pausa do aluno que entrou atrasado e recebeu o reanúncio
  // antes do `getClassSession` resolver — justamente o caso que o card atende.
  const prevActivityIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevActivityIdRef.current;
    prevActivityIdRef.current = currentActivityId;
    if (prev !== null && prev !== currentActivityId) setOnBreak(false);
  }, [currentActivityId]);

  const refetch = useCallback(() => {
    if (!sessionId) return;
    void getClassSession(sessionId).then(applySession);
  }, [sessionId, applySession]);

  // Initial durable read.
  useEffect(() => {
    let alive = true;
    if (!sessionId || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getClassSession(sessionId).then((s) => {
      if (!alive) return;
      applySession(s);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [sessionId, applySession]);

  // Realtime channel: broadcast (fast) + postgres_changes (durable) + presence.
  // Self-healing: a dropped/errored channel (mobile network blip, missed
  // heartbeat) is torn down and REBUILT from scratch with backoff — never
  // resubscribed in place (`.on()` after `subscribe()` throws).
  useEffect(() => {
    if (!sessionId || !isSupabaseConfigured) return;
    const sb = getSupabase();
    let disposed = false;
    let everJoined = false;
    let attempt = 0;
    let retryTimer: number | null = null;
    let scoreboardReplyTimer: number | null = null;
    let lastScoreboardReplyAt = 0;
    let current: RealtimeChannel | null = null;
    let currentCtrl: RealtimeChannel | null = null;

    const teardown = (ch: RealtimeChannel | null): Promise<unknown> => {
      if (!ch) return Promise.resolve();
      if (channelRef.current === ch) channelRef.current = null;
      if (ctrlRef.current === ch) ctrlRef.current = null;
      return sb.removeChannel(ch).catch(() => undefined);
    };

    const scheduleRetry = () => {
      if (disposed || removedRef.current || retryTimer !== null) return;
      const delay = reconnectDelayMs(attempt);
      attempt += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        reconnectNow();
      }, delay);
    };

    // O KICK é broadcast, ou seja auto-atestado — quem decide que o aluno saiu é
    // a linha em class_removals. Sem esta confirmação qualquer colega expulsa
    // qualquer um pelo devtools.
    const confirmRemoval = () => {
      void amIRemovedFrom(sessionId).then((yes) => {
        if (!yes || disposed) return;
        removedRef.current = true;
        setRemoved(true);
      });
    };

    // A resposta do professor ao pedido de placar. Sai do BANCO, nunca do placar
    // que ele ouviu: o `answered` é auto-atestado no tópico compartilhado, e
    // repassá-lo daqui carimbaria um acerto forjado com a autoridade do tópico de
    // staff, de forma irreversível (o `recordAnswer` é monótono).
    //
    // Coalescida E com piso entre respostas: depois de uma queda de rede a turma
    // reconecta junta, e o pedido é uma mensagem que qualquer participante (aluno
    // ou convidado) pode repetir à vontade — sem o piso, um cliente em loop viraria
    // uma leitura do banco e um broadcast grande a cada 400 ms no MESMO tópico que
    // carrega `advance` / `timer` / `stage-show`. Pedido dentro do piso não é
    // descartado: ele empurra a resposta para a borda da janela.
    //
    // Falha na leitura = silêncio, não placar vazio — por isso
    // `getSessionScoreboard` lança em vez de devolver [].
    const replyWithScoreboard = (ctrl: RealtimeChannel) => {
      if (disposed || scoreboardReplyTimer !== null) return;
      const sinceLast = Date.now() - lastScoreboardReplyAt;
      const wait = Math.max(SCOREBOARD_REPLY_DEBOUNCE_MS, SCOREBOARD_REPLY_MIN_GAP_MS - sinceLast);
      scoreboardReplyTimer = window.setTimeout(() => {
        scoreboardReplyTimer = null;
        if (disposed || currentCtrl !== ctrl) return;
        const armed = timerRef.current;
        void getSessionScoreboard(sessionId)
          .then((entries) => {
            if (disposed || currentCtrl !== ctrl) return;
            // Placar vazio + cronômetro armado é EXATAMENTE o começo de uma
            // rodada cronometrada, que é quando alguém chega atrasado. Sair
            // calado aqui deixaria esse aluno travado até o tempo estourar.
            if (entries.length === 0 && !armed) return;
            lastScoreboardReplyAt = Date.now();
            // Corta no remetente, não só na leitura: o teto existe pra resposta
            // grande não ser RECUSADA inteira, e uma recusa deixaria o
            // recém-chegado sem placar nenhum — justo o que estamos consertando.
            return ctrl.send({
              type: 'broadcast',
              event: SCOREBOARD_EVENT,
              payload: {
                entries: entries.slice(0, SCOREBOARD_MAX_ENTRIES),
                timer: armed
                  ? { activity_id: armed.activityId, deadline: armed.deadline }
                  : null,
              },
            });
          })
          .catch(() => undefined);
      }, wait);
    };

    const reconnectNow = () => {
      if (disposed) return;
      const old = current;
      const oldCtrl = currentCtrl;
      current = null;
      currentCtrl = null;
      // Await the removal: realtime-js dedupes channels by topic, so connecting
      // before the errored instance is fully gone can hand back the SAME (non-
      // closed) instance whose `subscribe()` would silently no-op.
      void Promise.all([teardown(old), teardown(oldCtrl)]).then(() => {
        if (!disposed) connect();
      });
    };

    const connect = () => {
      if (disposed || removedRef.current) return;
      let mainJoined = false;
      let ctrlJoined = false;
      // The backoff resets only when BOTH topics are up: a ctrl that keeps
      // failing would otherwise rebuild the HEALTHY main channel every second
      // (roster flicker + a session refetch per client) instead of backing off.
      const syncJoinState = () => {
        setSharedConnected(mainJoined);
        setConnected(mainJoined && ctrlJoined);
        if (!(mainJoined && ctrlJoined)) return;
        attempt = 0;
        setReconnecting(false);
        // O aluno pede o placar da turma aqui, e não no SUBSCRIBED do canal
        // compartilhado, porque a RESPOSTA vem no de staff: pedir antes de estar
        // ouvindo os dois seria pedir e perder. Pedido repetido é barato — o
        // professor coalesce (`replyWithScoreboard`).
        if (identityRef.current?.isInstructor === true) return;
        void channel.send({ type: 'broadcast', event: SCOREBOARD_REQUEST_EVENT, payload: {} });
      };
      const presenceKey =
        identityRef.current?.userId ?? `anon-${Math.random().toString(36).slice(2, 10)}`;

      // Private channel: joining/sending is gated by realtime.messages RLS
      // (migration 0022) so only session participants can broadcast/track. Make
      // sure the realtime socket carries the user's JWT before the private join;
      // supabase-js sets it on init, but this closes the first-load race (a
      // failed join just retries via scheduleRetry once auth lands).
      void sb.realtime.setAuth();
      const channel = sb.channel(`class:${sessionId}`, {
        config: { private: true, presence: { key: presenceKey }, broadcast: { self: true } },
      });
      // Instructor-driven events ride the staff-write topic (migration 0023).
      // Everyone joins it to LISTEN; only class staff may send on it, so advance
      // / timer / stage-pull can no longer be forged by a cohort member.
      const ctrl = sb.channel(`class:${sessionId}:ctrl`, {
        config: { private: true, broadcast: { self: true } },
      });
      current = channel;
      currentCtrl = ctrl;
      // Published BEFORE the subscribe chains: the SUBSCRIBED callback calls
      // trackPresence(), which reads channelRef.
      channelRef.current = channel;
      ctrlRef.current = ctrl;

      // Rebuild the roster from the full presence state. Wired to sync/join/leave
      // (not just sync) so a LATE joiner — whose initial `sync` can land before the
      // server relays the already-present members — still converges once presence
      // settles; a stable member (e.g. the professor) never re-tracks to re-trigger it.
      const syncRoster = () => {
        const state = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
        const members: ClassPresenceMember[] = [];
        const seen = new Set<string>();
        for (const key of Object.keys(state)) {
          // Re-tracking (hand raise/lower) APPENDS a new meta — the newest is last.
          // Exceto o papel: o mesmo professor pode estar com o console e a aba de
          // aluno (`?como=aluno`) abertos, e aí as duas metas dividem a chave. A
          // escolha explícita dele vence, senão a linha dele pisca no pódio.
          const metas = state[key] ?? [];
          const meta = metas.at(-1) ?? {};
          const asLearner = metas.some((m) => m.is_instructor === false);
          const uid = typeof meta.user_id === 'string' ? meta.user_id : key;
          if (seen.has(uid)) continue;
          seen.add(uid);
          members.push({
            userId: uid,
            name: typeof meta.name === 'string' ? meta.name : uid.slice(0, 8),
            avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
            isInstructor: !asLearner && meta.is_instructor === true,
            isGuest: meta.is_guest === true,
            handRaised: meta.hand_raised === true,
            workingOn: typeof meta.working_on === 'string' ? meta.working_on : null,
          });
        }
        setRoster(members);
      };

      ctrl
        .on('broadcast', { event: ADVANCE_EVENT }, ({ payload }) => {
          const next = (payload as { current_activity_id?: string | null })?.current_activity_id;
          // Only a real activity id is honored from the broadcast fast-path. A
          // `null` (return-to-reception) is NOT accepted here — it can only come
          // from the durable session row (postgres_changes / refetch), so a spoofed
          // broadcast (now limited to session participants) can't shove the class
          // back to the lobby.
          if (typeof next === 'string') {
            setCurrentActivityId(next);
            setTimer(null);
            setStoppedFor(null);
            setStagedAnswer(null);
            pendingStageRef.current = null;
            liveStageRef.current = null;
            stagedSelfRef.current = null;
            answeredStageRef.current = null;
            clearStageTimeout();
            setStagePendingUserId(null);
            setStageUnreachableUserId(null);
          }
        })
        .on('broadcast', { event: TIMER_EVENT }, ({ payload }) => {
          const next = parseTimerEvent(payload);
          if (next) {
            setTimer(next);
            setStoppedFor((prev) => (prev === next.activityId ? null : prev));
          }
        })
        .on('broadcast', { event: TIMER_STOP_EVENT }, ({ payload }) => {
          setTimer((prev) => timerAfterStop(prev, payload));
          const p = payload as { activity_id?: unknown } | null;
          if (p && typeof p.activity_id === 'string') setStoppedFor(p.activity_id);
        })
        // stage-request (instructor → all): the TARGETED learner replies with its
        // OWN work for the current activity — finished OR in progress OR an
        // explicit empty state (ADR-4 revised). The learner is still the only one
        // who can answer for itself; what changed is that "no answer yet" is now
        // a real reply instead of silence.
        .on('broadcast', { event: STAGE_REQUEST_EVENT }, ({ payload }) => {
          const p = payload as
            | { activityId?: string; targetUserId?: string; nonce?: string }
            | null;
          const id = identityRef.current;
          const sid = sessionIdRef.current;
          if (!p?.activityId || !p.targetUserId || !p.nonce || !id || !sid) return;
          if (p.targetUserId !== id.userId || p.activityId !== currentActivityIdRef.current) return;
          const gathered = gatherStageContent(sid, p.activityId);
          answeredStageRef.current = p.activityId;
          void channel.send({
            type: 'broadcast',
            event: STAGE_ANSWER_EVENT,
            payload: {
              activityId: p.activityId,
              userId: id.userId,
              nonce: p.nonce,
              kind: gathered.kind,
              content: gathered.content,
              status: gathered.status,
              response: gathered.response,
              terminal: gathered.terminal,
              chat: gathered.chat,
              author: { userId: id.userId, name: id.name, avatarUrl: id.avatarUrl ?? null },
            },
          });
        })
        // stage-show (instructor → all): the ONLY source clients render the stage
        // from — honored only for the current activity.
        .on('broadcast', { event: STAGE_SHOW_EVENT }, ({ payload }) => {
          const p = payload as
            | {
                activityId?: string;
                kind?: string;
                content?: string;
                status?: unknown;
                response?: unknown;
                terminal?: unknown;
                chat?: unknown;
                author?: { userId?: string; name?: string; avatarUrl?: string | null };
              }
            | null;
          if (!p?.activityId || typeof p.kind !== 'string' || typeof p.content !== 'string') return;
          if (p.activityId !== currentActivityIdRef.current) return;
          const a = p.author;
          if (!a?.userId || typeof a.name !== 'string') return;
          setStagedAnswer({
            activityId: p.activityId,
            kind: p.kind,
            content: p.content,
            status: parseStageStatus(p.status),
            response: clampStageResponse(p.response),
            terminal: parseStageTerminal(p.terminal),
            chat: parseStageChat(p.chat),
            author: { userId: a.userId, name: a.name, avatarUrl: a.avatarUrl ?? null },
          });
          // If MY work is the one on stage, start streaming edits; if someone
          // else took the stage, stop (I'm no longer the live source). Only arm
          // when I actually answered a pull for this activity — a forged
          // stage-show naming me can't turn me into a silent live source.
          const me = identityRef.current?.userId;
          stagedSelfRef.current =
            me && a.userId === me && answeredStageRef.current === p.activityId ? p.activityId : null;
        })
        // Só o alvo reage: a linha em class_removals já nega o JOIN dele, isto
        // é o que troca a tela na hora em vez de deixá-lo vendo um spinner.
        .on('broadcast', { event: KICK_EVENT }, ({ payload }) => {
          const target = (payload as { user_id?: string } | null)?.user_id;
          if (target && target === identityRef.current?.userId) confirmRemoval();
        })
        .on('broadcast', { event: BREAK_EVENT }, ({ payload }) => {
          setOnBreak((payload as { on?: unknown } | null)?.on === true);
        })
        // O placar do professor chegando. Dobra pelo `recordAnswer`, que é
        // MONOTONE: o anúncio só pode ACRESCENTAR o que este cliente não ouviu,
        // nunca rebaixar um acerto que ele viu nem reescrever um tempo.
        .on('broadcast', { event: SCOREBOARD_EVENT }, ({ payload }) => {
          for (const e of parseScoreboard(payload)) {
            recordAnswer(e.activityId, e.userId, e.correct, e.elapsedMs);
          }
          // `deadline` é absoluto, então repetir o mesmo prazo pra quem já o tem
          // não muda nada — e é o que rehidrata quem não tem.
          const armed = parseTimerEvent((payload as { timer?: unknown } | null)?.timer);
          if (armed) setTimer(armed);
        })
        // Abaixar a mão de outro é impossível por escrita (presença é do dono),
        // então é o cliente do aluno que abaixa a própria e re-publica.
        .on('broadcast', { event: HAND_LOWER_EVENT }, ({ payload }) => {
          const target = (payload as { user_id?: string } | null)?.user_id;
          if (!target || target !== identityRef.current?.userId) return;
          handRaisedRef.current = false;
          setHandRaisedState(false);
          trackPresence();
        })
        .on('broadcast', { event: STAGE_CLEAR_EVENT }, () => {
          setStagedAnswer(null);
          pendingStageRef.current = null;
          liveStageRef.current = null;
          stagedSelfRef.current = null;
          answeredStageRef.current = null;
          clearStageTimeout();
          setStagePendingUserId(null);
          setStageUnreachableUserId(null);
        })
        .subscribe((s) => {
          if (disposed || currentCtrl !== ctrl) return;
          ctrlJoined = s === 'SUBSCRIBED';
          syncJoinState();
          if (ctrlJoined || !(s === 'CLOSED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT')) return;
          if (everJoined) setReconnecting(true);
          scheduleRetry();
        });

      channel
        // stage-answer → THE GATE: only the instructor honors it, and only when the
        // reply's userId + nonce match the in-flight pull. It then re-broadcasts
        // stage-show on the control topic, so a learner can NEVER stage arbitrary
        // content on the class.
        .on('broadcast', { event: STAGE_ANSWER_EVENT }, ({ payload }) => {
          const pending = pendingStageRef.current;
          const p = payload as
            | {
                activityId?: string;
                userId?: string;
                nonce?: string;
                kind?: string;
                content?: string;
                status?: unknown;
                response?: unknown;
                terminal?: unknown;
                chat?: unknown;
                author?: unknown;
              }
            | null;
          if (!pending || !p?.userId || !p.nonce || !p.activityId) return;
          if (p.userId !== pending.targetUserId || p.nonce !== pending.nonce) return;
          if (p.activityId !== currentActivityIdRef.current) return;
          pendingStageRef.current = null;
          liveStageRef.current = { targetUserId: p.userId, activityId: p.activityId };
          clearStageTimeout();
          setStagePendingUserId(null);
          setStageUnreachableUserId(null);
          void ctrl.send({
            type: 'broadcast',
            event: STAGE_SHOW_EVENT,
            payload: {
              activityId: p.activityId,
              kind: p.kind,
              content: p.content,
              status: parseStageStatus(p.status),
              response: clampStageResponse(p.response),
              terminal: parseStageTerminal(p.terminal),
              chat: parseStageChat(p.chat),
              author: p.author,
            },
          });
        })
        // stage-update (staged learner → all): the learner on stage re-sends its
        // work as it edits. Only the instructor honors it, and only for the target
        // it already resolved a pull to — then forwards it as a fresh stage-show.
        .on('broadcast', { event: STAGE_UPDATE_EVENT }, ({ payload }) => {
          const live = liveStageRef.current;
          const p = payload as
            | {
                activityId?: string;
                userId?: string;
                kind?: string;
                content?: string;
                status?: unknown;
                response?: unknown;
                terminal?: unknown;
                chat?: unknown;
                author?: unknown;
              }
            | null;
          if (!live || !p?.userId || !p.activityId) return;
          if (p.userId !== live.targetUserId || p.activityId !== live.activityId) return;
          if (p.activityId !== currentActivityIdRef.current) return;
          void ctrl.send({
            type: 'broadcast',
            event: STAGE_SHOW_EVENT,
            payload: {
              activityId: p.activityId,
              kind: p.kind,
              content: p.content,
              status: parseStageStatus(p.status),
              response: clampStageResponse(p.response),
              terminal: parseStageTerminal(p.terminal),
              chat: parseStageChat(p.chat),
              author: p.author,
            },
          });
        })
        // answered (learner → all) — the only learner-sent event left; recorded
        // monotonically, see recordAnswer.
        .on('broadcast', { event: ANSWERED_EVENT }, ({ payload }) => {
          const p = payload as {
            activity_id?: string;
            user_id?: string;
            correct?: boolean;
            elapsed_ms?: number;
          } | null;
          if (!p?.activity_id || !p.user_id) return;
          recordAnswer(p.activity_id, p.user_id, p.correct === true, p.elapsed_ms);
        })
        // scoreboard-request (learner → professor). Só o professor responde, e a
        // resposta é uma só pra todo mundo — o tópico já entrega em quem estava
        // offline junto. Ver `replyWithScoreboard`.
        .on('broadcast', { event: SCOREBOARD_REQUEST_EVENT }, () => {
          if (identityRef.current?.isInstructor !== true) return;
          replyWithScoreboard(ctrl);
        })
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'itera', table: 'class_sessions', filter: `id=eq.${sessionId}` },
          (payload) => {
            const row = payload.new as Record<string, unknown> | null;
            if (row && row.id) applySession(mapSession(row));
          }
        )
        .on('presence', { event: 'sync' }, syncRoster)
        .on('presence', { event: 'join' }, ({ currentPresences }) => {
          syncRoster();
          // Quem chega (ou recarrega) durante a pausa não ouviu o broadcast que
          // a abriu — o professor reanuncia, senão a tela dele fica sozinha
          // mostrando exercício enquanto a turma está tirando dúvida.
          //
          // `currentPresences` vazio é o filtro de CHAVE NOVA: o Phoenix dispara
          // `join` de novo a cada re-`track` (mão levantada, working_on), e numa
          // pausa é justo quando as mãos sobem — sem o filtro, cada mão vira um
          // broadcast para a sala inteira.
          if (currentPresences.length > 0) return;
          if (!onBreakRef.current || identityRef.current?.isInstructor !== true) return;
          void ctrl.send({ type: 'broadcast', event: BREAK_EVENT, payload: { on: true } });
        })
        .on('presence', { event: 'leave' }, syncRoster)
        .subscribe((s) => {
          // A replaced channel keeps firing status callbacks while its teardown
          // drains — only the CURRENT channel may drive state / retries.
          if (disposed || current !== channel) return;
          const isJoined = s === 'SUBSCRIBED';
          mainJoined = isJoined;
          syncJoinState();
          if (isJoined) {
            everJoined = true;
            // Belt-and-suspenders: re-read presence shortly after joining, in case
            // the initial `sync` landed before the existing members were relayed.
            // Guarded so a drop right after joining can't wipe the roster from a
            // stale channel's drained presence state.
            const lateSync = () => {
              if (!disposed && current === channel) syncRoster();
            };
            setTimeout(lateSync, 400);
            setTimeout(lateSync, 1500);
            // Realtime does NOT replay postgres_changes after a socket blip, so a
            // client that reconnects (or joins late) can miss an advance — including
            // leaving the reception. Re-read the durable row on every (re)subscribe
            // so it always converges instead of getting stranded in the lobby.
            void getClassSession(sessionId).then(applySession);
            // O pódio re-hidrata do banco a cada (re)join pelo mesmo motivo do
            // advance: broadcast não é reenviado depois de um blip. O PROFESSOR
            // lê do banco, porque é ele que responde pela
            // turma e um professor que recarrega no meio da aula não pode virar a
            // fonte do placar sem TER o placar. O ALUNO pede — a RLS de
            // `class_answers` devolveria a ele só a própria linha, e é ele que sabe
            // que acabou de conectar sem o placar dos colegas (defeito B1).
            if (identityRef.current?.isInstructor === true) {
              void getSessionScoreboard(sessionId)
                .then((entries) => {
                  if (disposed || current !== channel) return;
                  for (const e of entries) {
                    recordAnswer(e.activityId, e.userId, e.correct, e.elapsedMs);
                  }
                })
                .catch(() => undefined);
              // E responde sem ninguém pedir, uma vez. O pedido do aluno é uma
              // mensagem só, sem retry: quem pediu antes deste professor existir na
              // sala — ele abre a aula depois dos alunos, recarrega, ou ainda estava
              // resolvendo a identidade quando o pedido passou — ficaria com o pódio
              // de uma pessoa pelo resto da aula. Diferente do reanúncio por
              // presença que isto substituiu, aqui não há chave fantasma no meio: o
              // gatilho é o próprio (re)subscribe dele.
              replyWithScoreboard(ctrl);
            }
            trackPresence();
            return;
          }
          if (s === 'CLOSED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
            if (everJoined) setReconnecting(true);
            // Remoção com a aba em segundo plano não gera broadcast lido: o que
            // sobra é o JOIN sendo negado pela RLS, que sem isto vira spinner
            // eterno de reconexão.
            if (attempt >= 3) confirmRemoval();
            scheduleRetry();
          }
        });
    };

    // Back to the foreground (phone unlock / tab switch) with a retry pending →
    // reconnect NOW instead of waiting out the backoff.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || retryTimer === null) return;
      clearTimeout(retryTimer);
      retryTimer = null;
      reconnectNow();
    };
    document.addEventListener('visibilitychange', onVisible);

    connect();
    return () => {
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (scoreboardReplyTimer !== null) clearTimeout(scoreboardReplyTimer);
      document.removeEventListener('visibilitychange', onVisible);
      const old = current;
      const oldCtrl = currentCtrl;
      current = null;
      currentCtrl = null;
      teardown(old);
      teardown(oldCtrl);
    };
    // Subscribe ONCE per session (per channel INSTANCE — reconnects build a NEW
    // instance). `class:<id>` is a SHARED broadcast/presence topic (can't be
    // uniquified like the badge channel), and realtime-js dedupes by topic +
    // removeChannel() is async — so re-running this effect (e.g. when identity
    // resolves after sessionId) would reuse the still-joined channel and
    // `.on('postgres_changes'|'presence', …)` would THROW ("after `subscribe()`").
    // Identity is read via identityRef and tracked in the effect below, so it
    // never needs to be a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Track (or re-track) presence identity once the channel is connected and
  // identity is known — without tearing down / re-subscribing the channel.
  useEffect(() => {
    if (!sharedConnected || !identity) return;
    trackPresence();
    // Track on the primitive identity fields, not the object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sharedConnected,
    identity?.userId,
    identity?.name,
    identity?.avatarUrl,
    identity?.isInstructor,
  ]);

  // ── Cursor topic ──────────────────────────────────────────────────────────
  // Joined ONLY while something is on stage, and torn down the moment it is
  // cleared. That is the cost lever from ADR-3 stated as a lifecycle: a room
  // with no stage pays nothing, and the subscriber count that multiplies every
  // frame is bounded by the people who actually have a mirror on screen.
  //
  // Isolated from the main channel effect on purpose: a refused JOIN or send
  // here (e.g. migration 0036 not applied yet) must never touch the stage, the
  // roster or the class pointer. It fails to "no cursor", nothing else.
  const stageOn = stagedAnswer !== null;
  useEffect(() => {
    if (!sessionId || !isSupabaseConfigured || !stageOn) {
      setStageCursor(null);
      stageCursorTsRef.current = 0;
      setInstructorCursor(null);
      setInstructorClick(null);
      instructorCursorTsRef.current = 0;
      return;
    }
    const sb = getSupabase();
    void sb.realtime.setAuth();
    const channel = sb.channel(cursorTopic(sessionId), {
      // self:false — the emitter is the person ON stage; on their own screen the
      // mirror is their own live work, so echoing their cursor back would draw a
      // ghost chasing their real pointer. It also shaves one billed message per
      // frame.
      config: { private: true, broadcast: { self: false } },
    });
    cursorRef.current = channel;
    channel
      .on('broadcast', { event: STAGE_CURSOR_EVENT }, ({ payload }) => {
        const p = payload as Partial<StageCursor> | null;
        if (!p || typeof p.userId !== 'string' || typeof p.activityId !== 'string') return;
        // The trust model is inherited from stage-show (R5): RLS authorizes the
        // TOPIC by session participation, not the sender's role. So the receiver
        // is what narrows a forgeable event down to "the one person already on
        // stage" — a classmate cannot move the cursor the class is watching.
        if (p.userId !== stageAuthorRef.current) return;
        if (p.activityId !== currentActivityIdRef.current) return;
        // `Number.isFinite`, not `typeof number`: NaN survives the clamp below
        // (`Math.min(1, Math.max(0, NaN))` is NaN) and then poisons the overlay's
        // tween ref, freezing the mirrored pointer for the rest of the class.
        if (typeof p.x !== 'number' || !Number.isFinite(p.x)) return;
        if (typeof p.y !== 'number' || !Number.isFinite(p.y)) return;
        // Broadcast gives no ordering guarantee, and a late packet would yank
        // the cursor visibly backwards — worse than a dropped frame.
        const t = typeof p.t === 'number' ? p.t : 0;
        if (t < stageCursorTsRef.current) return;
        stageCursorTsRef.current = t;
        const caret =
          p.caret && typeof p.caret.line === 'number' && typeof p.caret.column === 'number'
            ? { line: p.caret.line, column: p.caret.column }
            : null;
        setStageCursor({
          activityId: p.activityId,
          userId: p.userId,
          x: Math.min(1, Math.max(0, p.x)),
          y: Math.min(1, Math.max(0, p.y)),
          paneW: acceptPanePx(p.paneW),
          paneH: acceptPanePx(p.paneH),
          visible: p.visible !== false,
          caret,
          t,
        });
      })
      .on('broadcast', { event: INSTRUCTOR_CURSOR_EVENT }, ({ payload }) => {
        const p = payload as Partial<StageCursor & { click?: boolean }> | null;
        if (!p || typeof p.userId !== 'string' || typeof p.activityId !== 'string') return;
        // Aqui o receptor NÃO pode estreitar por "quem está no palco" — o
        // emissor é justamente quem não está. Estreita pela LINHA do banco
        // (`class_sessions.instructor_id`), e não pela presença: presença é
        // auto-declarada, então `is_instructor` ali é forjável por qualquer
        // aluno da sala. Um colega continua podendo colocar bytes no tópico; o
        // que ele não consegue é desenhar um ponteiro de professor na tela da
        // turma.
        if (p.userId !== instructorIdRef.current) return;
        if (p.activityId !== currentActivityIdRef.current) return;
        if (typeof p.x !== 'number' || typeof p.y !== 'number') return;
        const t = typeof p.t === 'number' ? p.t : 0;
        if (t < instructorCursorTsRef.current) return;
        instructorCursorTsRef.current = t;
        const x = Math.min(1, Math.max(0, p.x));
        const y = Math.min(1, Math.max(0, p.y));
        // Sem caret, de propósito: o professor está sobre um painel READ-ONLY,
        // então ele não tem caret pra mostrar — e o caret desenhado no espelho é
        // o de quem está digitando de verdade.
        // Mesmo motivo do cursor do aluno: o painel do professor e o do aluno
        // têm alturas diferentes (`h-[clamp(360px,55vh,720px)]`), então sem o
        // tamanho do painel de origem o ponteiro cai em percentual e erra
        // algumas linhas na tela do aluno.
        setInstructorCursor({
          activityId: p.activityId,
          userId: p.userId,
          x,
          y,
          paneW: acceptPanePx(p.paneW),
          paneH: acceptPanePx(p.paneH),
          visible: p.visible !== false,
          caret: null,
          t,
        });
        if (p.click === true) setInstructorClick({ x, y, t });
      })
      .subscribe();
    return () => {
      if (cursorRef.current === channel) cursorRef.current = null;
      void sb.removeChannel(channel).catch(() => undefined);
      setStageCursor(null);
      stageCursorTsRef.current = 0;
      setInstructorCursor(null);
      setInstructorClick(null);
      instructorCursorTsRef.current = 0;
    };
  }, [sessionId, stageOn]);

  // Handing the stage from one learner straight to another never passes through
  // "no stage", so the topic (correctly) stays joined — but the previous
  // person's last frame must not linger under the new person's name.
  const stageAuthorId = stagedAnswer?.author.userId ?? null;
  useEffect(() => {
    setStageCursor(null);
    stageCursorTsRef.current = 0;
    setInstructorCursor(null);
    setInstructorClick(null);
    instructorCursorTsRef.current = 0;
  }, [stageAuthorId]);

  // The single emitter in the room (ADR-2): the client whose own work is staged.
  const isStageCursorSource = Boolean(
    identity?.userId && stagedAnswer && stagedAnswer.author.userId === identity.userId
  );
  const isStageCursorSourceRef = useRef(false);
  isStageCursorSourceRef.current = isStageCursorSource;

  const sendStageCursor = useCallback(
    (frame: StageCursorFrame) => {
      const channel = cursorRef.current;
      const activityId = currentActivityIdRef.current;
      const userId = identityRef.current?.userId;
      if (!channel || !activityId || !userId || !isStageCursorSourceRef.current) return;
      void channel
        .send({
          type: 'broadcast',
          event: STAGE_CURSOR_EVENT,
          payload: {
            activityId,
            userId,
            x: frame.x,
            y: frame.y,
            paneW: frame.paneW,
            paneH: frame.paneH,
            visible: frame.visible,
            caret: frame.caret,
            t: Date.now(),
          },
        })
        // A refused send (RLS, blip) is not worth an unhandled rejection in the
        // middle of a class — the mirror just misses a frame.
        .catch(() => undefined);
    },
    []
  );

  // O emissor do caminho inverso: o professor, e só enquanto há palco de OUTRA
  // pessoa. Sobre o próprio trabalho ele já é o `isStageCursorSource` de cima —
  // ligar os dois faria a turma ver dois ponteiros dele, no mesmo lugar.
  const isInstructorCursorSource = Boolean(
    identity?.userId &&
      session &&
      identity.userId === session.instructorId &&
      stagedAnswer &&
      stagedAnswer.author.userId !== identity.userId
  );
  const isInstructorCursorSourceRef = useRef(false);
  isInstructorCursorSourceRef.current = isInstructorCursorSource;

  const sendInstructorCursor = useCallback((frame: StageCursorFrame) => {
    const channel = cursorRef.current;
    const activityId = currentActivityIdRef.current;
    const userId = identityRef.current?.userId;
    if (!channel || !activityId || !userId || !isInstructorCursorSourceRef.current) return;
    void channel
      .send({
        type: 'broadcast',
        event: INSTRUCTOR_CURSOR_EVENT,
        payload: {
          activityId,
          userId,
          x: frame.x,
          y: frame.y,
          paneW: frame.paneW,
          paneH: frame.paneH,
          visible: frame.visible,
          click: frame.click === true,
          t: Date.now(),
        },
      })
      .catch(() => undefined);
  }, []);

  // How fast that emitter may go, given how many people would be billed for each
  // frame. Recomputed as the roster changes, so a room that grows mid-class slows
  // the cursor down instead of walking into the project's disconnect ceiling.
  const cursorPlan = useMemo(() => stageCursorPlan(roster.length), [roster.length]);

  const setHandRaised = useCallback(
    (raised: boolean) => {
      handRaisedRef.current = raised;
      setHandRaisedState(raised);
      trackPresence();
    },
    [trackPresence]
  );

  const lowerHand = useCallback((userId: string) => {
    if (!userId) return;
    void ctrlRef.current?.send({
      type: 'broadcast',
      event: HAND_LOWER_EVENT,
      payload: { user_id: userId },
    });
  }, []);

  const removeLearner = useCallback((userId: string) => {
    const sid = sessionIdRef.current;
    if (!sid || !userId) return Promise.resolve(false);
    return removeFromClass(sid, userId).then(
      () => {
        ctrlRef.current?.send({
          type: 'broadcast',
          event: KICK_EVENT,
          payload: { user_id: userId },
        });
        return true;
      },
      () => false
    );
  }, []);

  // Learner side: announce (via presence) that there IS local work for this
  // activity, so the professor's picker can show "em andamento" before pulling.
  // Guarded on a real change — the code snack autosaves every 600ms and we do
  // NOT want a presence re-track per keystroke burst.
  const setWorkingOn = useCallback(
    (activityId: string | null) => {
      if (workingOnRef.current === activityId) return;
      workingOnRef.current = activityId;
      trackPresence();
    },
    [trackPresence]
  );

  // Instructor pulls a learner's work to the stage: arm a nonce for the target
  // and broadcast stage-request. The matching stage-answer (gated in the channel
  // handler) is what flips the class to stage-show.
  const requestStage = useCallback(
    (targetUserId: string) => {
      const ctrl = ctrlRef.current;
      const activityId = currentActivityIdRef.current;
      if (!ctrl || !activityId || !targetUserId) return;
      const nonce =
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      pendingStageRef.current = { nonce, targetUserId };
      setStagePendingUserId(targetUserId);
      setStageUnreachableUserId(null);
      clearStageTimeout();
      // Nobody can answer for an offline learner (the snapshot lives in THEIR
      // localStorage), so a silent request would spin forever. Give up loudly.
      stageTimeoutRef.current = window.setTimeout(() => {
        stageTimeoutRef.current = null;
        // Only abandon the pull we armed — a newer request already took over.
        if (pendingStageRef.current?.nonce !== nonce) return;
        pendingStageRef.current = null;
        setStagePendingUserId(null);
        setStageUnreachableUserId(targetUserId);
      }, STAGE_REPLY_TIMEOUT_MS);
      void ctrl.send({
        type: 'broadcast',
        event: STAGE_REQUEST_EVENT,
        payload: { activityId, targetUserId, nonce },
      });
    },
    [clearStageTimeout]
  );

  const clearStage = useCallback(() => {
    const ctrl = ctrlRef.current;
    pendingStageRef.current = null;
    liveStageRef.current = null;
    stagedSelfRef.current = null;
    answeredStageRef.current = null;
    clearStageTimeout();
    setStagePendingUserId(null);
    setStageUnreachableUserId(null);
    setStagedAnswer(null);
    if (!ctrl) return;
    void ctrl.send({ type: 'broadcast', event: STAGE_CLEAR_EVENT, payload: {} });
  }, [clearStageTimeout]);

  // A pull left in flight when the page unmounts must not fire into a dead tree.
  useEffect(() => clearStageTimeout, [clearStageTimeout]);

  // O F5 do aluno removido não passa pelo broadcast (ele já não entra no canal),
  // e o JOIN negado só produziria um "reconectando…" eterno. A linha durável é
  // o que diz a verdade, então ela é lida uma vez na montagem.
  useEffect(() => {
    if (!sessionId) return;
    let alive = true;
    void amIRemovedFrom(sessionId).then((yes) => {
      if (!alive || !yes) return;
      removedRef.current = true;
      setRemoved(true);
    });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  // Sair da sala é sair mesmo: sem derrubar os canais o cliente removido segue
  // com presença no tópico e o professor continua vendo o aluno na lista.
  useEffect(() => {
    if (!removed || !isSupabaseConfigured) return;
    const sb = getSupabase();
    const open = [channelRef.current, ctrlRef.current].filter(Boolean) as RealtimeChannel[];
    channelRef.current = null;
    ctrlRef.current = null;
    for (const ch of open) void sb.removeChannel(ch).catch(() => undefined);
  }, [removed]);

  // Live stage: while THIS learner's work is on stage, re-broadcast it on every
  // autosave so the class mirror tracks the edits in real time (no polling — the
  // snapshot service already fires this on its debounced save).
  useEffect(() => {
    const onSnapshot = (e: Event) => {
      const staged = stagedSelfRef.current;
      const sid = sessionIdRef.current;
      const id = identityRef.current;
      const channel = channelRef.current;
      if (!staged || !sid || !id || !channel) return;
      if (staged !== currentActivityIdRef.current) return;
      const detailActivity = (e as CustomEvent<{ activityId?: string }>).detail?.activityId;
      if (detailActivity && detailActivity !== staged) return;
      const gathered = gatherStageContent(sid, staged);
      void channel.send({
        type: 'broadcast',
        event: STAGE_UPDATE_EVENT,
        payload: {
          activityId: staged,
          userId: id.userId,
          kind: gathered.kind,
          content: gathered.content,
          status: gathered.status,
          response: gathered.response,
          terminal: gathered.terminal,
          chat: gathered.chat,
          author: { userId: id.userId, name: id.name, avatarUrl: id.avatarUrl ?? null },
        },
      });
    };
    window.addEventListener(CODE_SNAPSHOT_EVENT, onSnapshot);
    // The terminal has no snapshot service to piggyback on — it persists no
    // draft — so it carries its own signal. Without this line the stage would
    // freeze at the instant of the pull and every command the learner ran after
    // it would be invisible to the room, which is the half of the defect that a
    // one-shot mirror does not fix.
    window.addEventListener(TERMINAL_LIVE_EVENT, onSnapshot);
    // The chat has no snapshot service either, and the same half of the defect
    // applies: without this line a message the learner sends AFTER the pull never
    // reaches the room, and the stage shows a conversation that stopped.
    window.addEventListener(CHAT_LIVE_EVENT, onSnapshot);
    return () => {
      window.removeEventListener(CODE_SNAPSHOT_EVENT, onSnapshot);
      window.removeEventListener(TERMINAL_LIVE_EVENT, onSnapshot);
      window.removeEventListener(CHAT_LIVE_EVENT, onSnapshot);
    };
  }, []);

  const broadcast = useCallback(
    (activityId: string) => {
      const ctrl = ctrlRef.current;
      // Optimistic local update for the professor's own screen.
      setCurrentActivityId(activityId);
      setTimer(null);
      setStoppedFor(null);
      if (!ctrl) return;
      void ctrl.send({
        type: 'broadcast',
        event: ADVANCE_EVENT,
        payload: { current_activity_id: activityId },
      });
    },
    []
  );

  const broadcastTimer = useCallback((activityId: string, durationSeconds: number) => {
    const ctrl = ctrlRef.current;
    const deadline = Date.now() + durationSeconds * 1000;
    // Optimistic local update first (mirrors clearTimer/broadcast) so the
    // professor's own screen reflects the timer even if the channel just blipped.
    setTimer({ activityId, deadline });
    setStoppedFor((prev) => (prev === activityId ? null : prev));
    if (!ctrl) return;
    void ctrl.send({
      type: 'broadcast',
      event: TIMER_EVENT,
      payload: { activity_id: activityId, deadline },
    });
  }, []);

  const clearTimer = useCallback((activityId: string) => {
    const ctrl = ctrlRef.current;
    setTimer((prev) => (prev && prev.activityId === activityId ? null : prev));
    setStoppedFor(activityId);
    if (!ctrl) return;
    void ctrl.send({
      type: 'broadcast',
      event: TIMER_STOP_EVENT,
      payload: { activity_id: activityId },
    });
  }, []);

  const setBreak = useCallback((on: boolean) => {
    const ctrl = ctrlRef.current;
    setOnBreak(on);
    if (!ctrl) return;
    void ctrl.send({ type: 'broadcast', event: BREAK_EVENT, payload: { on } });
  }, []);

  const broadcastAnswer = useCallback(
    (activityId: string, correct: boolean, elapsedMs?: number) => {
      const channel = channelRef.current;
      const userId = identityRef.current?.userId;
      if (!channel || !userId) return;
      recordAnswer(activityId, userId, correct, elapsedMs);
      void channel.send({
        type: 'broadcast',
        event: ANSWERED_EVENT,
        payload: { activity_id: activityId, user_id: userId, correct, elapsed_ms: elapsedMs },
      });
    },
    [recordAnswer]
  );

  return {
    session,
    currentActivityId,
    status,
    roster,
    connected,
    reconnecting,
    loading,
    answers,
    elapsed,
    timer,
    stoppedFor,
    stagedAnswer,
    stagePendingUserId,
    stageUnreachableUserId,
    removed,
    handRaised,
    onBreak,
    setBreak,
    broadcast,
    broadcastAnswer,
    broadcastTimer,
    clearTimer,
    setHandRaised,
    lowerHand,
    removeLearner,
    setWorkingOn,
    requestStage,
    clearStage,
    stageCursor,
    stageCursorPlan: cursorPlan,
    isStageCursorSource,
    sendStageCursor,
    instructorCursor,
    instructorClick,
    isInstructorCursorSource,
    sendInstructorCursor,
    refetch,
  };
}
