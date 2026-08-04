/**
 * Live-class session page (`/live/:sessionId`) — the STUDENT surface of the
 * real-time cohort mode (plan 20260702-…).
 *
 * Reuses the EXACT same activity components as the solo player: the immersive
 * chrome (full-width bar + X + hearts) + <ActivityRenderer>. The ONLY difference
 * is the synchronicity layer — the activity on screen derives from the session's
 * server-authoritative `current_activity_id` (via useClassSession) instead of a
 * local `index`. Learner-driven advance is NEUTERED (Kahoot force-advance): when
 * the professor advances, everyone jumps; a student mid-activity loses it.
 *
 * Result writes are UNCHANGED (persistActivityProgress → itera.progress /
 * activity_results). Live mode only controls WHICH activity is on screen.
 *
 * GUEST MODE (plan 20260728-itera-guest-link-aula-sincrona, ADR-3). The very same
 * page also serves `/g/:code`, mounted OUTSIDE RequireAuth, when a
 * `GuestModeProvider` is above it. There is no forked page — the ~24 live
 * components and the sync logic would drift on the first live fix. Only four
 * things change, all read off `useGuestMode()`:
 *
 *   1. the session id comes from the guest join (resolved from the code) instead
 *      of the route param;
 *   2. lesson content comes from itera-api (`useLessonContent(_, code)`) because
 *      a membership-less JWT cannot read `itera.lessons` — that is the ONE thing
 *      it lacks (ADR-2/B5), and it is deliberately not fixed with a new policy;
 *   3. every exit lands on the guest end-card. The authenticated exits go to `/`,
 *      which is RequireAuth+RequireSubscription — for a guest that is a login
 *      wall, i.e. the demo would end on a rejection screen;
 *   4. no durable progress/XP write (ADR-6) — RLS would ALLOW it (the guest has a
 *      real itera.users id, so `progress_rw_self` is satisfied), so this is a
 *      client-side rule and has to be honoured here.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { LiveReception } from '@/components/live/LiveReception';
import { LiveNameGate } from '@/components/live/LiveNameGate';
import { LiveSessionChrome } from '@/components/live/LiveSessionChrome';
import { LiveActivityStage } from '@/components/live/LiveActivityStage';
import { LiveStage } from '@/components/live/LiveStage';
import { ActivitySkeleton } from '@/components/branded/activity/ActivitySkeleton';
import { FeedbackFooter } from '@/components/branded/activity/FeedbackFooter';
import {
  isFooterGradedKind,
  type ActivityCompleteDetail,
  type FooterResult,
} from '@/components/branded/activity/activityFeedbackKinds';
import { isByocActivity } from '@/components/branded/activity/byoc/byocSpec';
import { isExerciseActivity } from '@/utils/isExerciseActivity';
import { LiveTimer } from '@/components/live/LiveTimer';
import { LiveStopwatch } from '@/components/live/LiveStopwatch';
import { LiveSidebar } from '@/components/live/LiveSidebar';
import { useLessonContent } from '@/hooks';
import { useClassSession } from '@/hooks/useClassSession';
import { useStageCursorCapture } from '@/hooks/useStageCursorCapture';
import { useIteraIdentity } from '@/hooks/useIteraIdentity';
import { useLiveSound } from '@/hooks/useLiveSound';
import { useI18n } from '@/i18n';
import { useAnswerOutbox, writeOrQueue } from '@/hooks/useAnswerOutbox';
import { buildSpecSnapshot } from '@/utils/learningTrace';
import { buildPedagogicalContext } from '@/utils/pedagogicalContext';
import { useActivityDuration } from '@/hooks/useActivityDuration';
import { recordClassAttendance } from '@/services/classReport.service';
import { columnMaxWidthClass, LIVE_COLUMN_OVERRIDES } from '@/utils/activityColumnWidth';
import { mergeLiveAnswers } from '@/utils/mergeLiveAnswers';
import { rankByScore } from '@/utils/rankByScore';
import { buildLiveRoomRows } from '@/utils/liveRoomRows';
import { learnerActivityGate } from '@/utils/liveActivityGate';
import { LivePodium } from '@/components/live/LivePodium';
import { LiveHandButton } from '@/components/live/LiveHandButton';
import { LiveWaitingIndicator } from '@/components/live/LiveWaitingIndicator';
import { LiveSoundDock } from '@/components/live/LiveSoundDock';
import { LiveReconnectBanner } from '@/components/live/LiveReconnectBanner';
import { LiveRemovedScreen } from '@/components/live/LiveRemovedScreen';
import { LiveLeaveConfirm } from '@/components/live/LiveLeaveConfirm';
import { formatDuration } from '@/utils/formatDuration';
import { readStoredAnswer, storeAnswer } from '@/utils/liveAnswerStorage';
import { stageResponseText } from '@/utils/stageResponseText';
import { wantsLearnerView } from '@/utils/liveLearnerView';
import { readLiveEntryRole } from '@/utils/liveEntryRole';
import { gatherStageContent } from '@/utils/stageAnswerContent';
import { CODE_SNAPSHOT_EVENT } from '@/services/codeSnapshot.service';
import { isGenericName } from '@/utils/isGenericName';
import { useMembership } from '@/hooks/useMembership';
import { isInstructor as isStaffInstructor } from '@/services/membership.service';
import { useProfile } from '@/hooks/useProfile';
import { useGuestMode } from '@/guest/GuestModeContext';
import type { Activity } from '@/types/content';
import type { ClassCompleter } from '@/types/liveClass';


export default function LiveSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { t, locale } = useI18n();

  // Present ONLY under /g/:code (see GuestModeContext) — null is the normal,
  // authenticated case, so every branch below defaults to today's behaviour.
  const guest = useGuestMode();
  // The guest never has a :sessionId in the URL (the link carries a short code);
  // the id was resolved server-side when the guest session was minted.
  const sessionId = guest?.sessionId ?? params.sessionId;

  const entryRole = readLiveEntryRole(sessionId);
  const identity = useIteraIdentity();
  // Staff (instructor/admin/owner) who lands on the student surface must still
  // present as instructor — otherwise their presence enters the podium/ranking.
  // A guest holds zero memberships, so this resolves false without a special case.
  const { data: memberships } = useMembership();
  // ...a menos que ele TENHA ESCOLHIDO entrar como aluno (`?como=aluno`): aí
  // entrar no pódio é o ponto. Só rebaixa quem já era staff — pra um aluno o
  // parâmetro não muda nada, e o console segue atrás do `RequireRole`.
  const [searchParams] = useSearchParams();
  // Duas portas para a mesma escolha: o link `?como=aluno` e o gate de entrada
  // (LiveEntryRoleGate). Uma flag só, senão um efeito respeita uma e desfaz a outra.
  const asLearner = wantsLearnerView(searchParams) || entryRole === 'learner';
  const staff = isStaffInstructor(memberships ?? []) && !asLearner;
  // The guest's name/avatar come from the join (their itera.users row exists but
  // the profile read is not what the room should wait on); everything else is
  // the shared identity.
  const presenceName = guest?.displayName || identity.name;
  const presenceAvatar = guest ? guest.avatarUrl ?? identity.avatarUrl : identity.avatarUrl;
  const { session, currentActivityId, status, roster, connected, reconnecting, loading, timer, stoppedFor, answers, elapsed, stars, removed, handRaised, stagedAnswer, stageCursor, stageCursorPlan, isStageCursorSource, sendStageCursor, broadcastAnswer, setHandRaised, setWorkingOn } =
    useClassSession(
      sessionId,
      identity.userId
        ? {
            userId: identity.userId,
            name: presenceName,
            avatarUrl: presenceAvatar,
            isInstructor: staff,
            isGuest: Boolean(guest),
          }
        : undefined
    );

  // While MY work is the one on stage, my pointer over the code pane is the
  // class's shared reference (plan 20260728-…). Exactly one client in the room
  // ever emits, and the rate is derived from the room, not fixed — see
  // `utils/stageCursorRate`. A guest on stage emits like any learner (Q2 = A).
  useStageCursorCapture({
    active: isStageCursorSource && stageCursorPlan.enabled,
    intervalMs: stageCursorPlan.intervalMs,
    send: sendStageCursor,
  });

  // Guest content is served by itera-api, scoped to the invited session — the
  // ONE read a membership-less JWT cannot do for itself.
  const { data: lesson, isPending: lessonPending } = useLessonContent(
    session?.lessonId,
    guest?.code
  );
  const lessonLoaded = Boolean(lesson);
  const activities = useMemo<Activity[]>(() => lesson?.activities ?? [], [lesson]);

  // Peers' live progress on the current activity — sourced from the broadcast
  // answers (learners can't read others' rows under RLS), mapped over the present
  // learner roster.
  const peerAnswerers = useMemo(() => {
    const learners: ClassCompleter[] = roster
      .filter((m) => !m.isInstructor)
      .map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl, done: false }));
    return mergeLiveAnswers(learners, currentActivityId ? answers[currentActivityId] : undefined);
  }, [roster, answers, currentActivityId]);

  const current = useMemo(
    () => activities.find((a) => a.id === currentActivityId) ?? null,
    [activities, currentActivityId]
  );

  // Redirect instructor to the instructor control surface for THIS session.
  // Handles "re-entry" after accidentally navigating here directly (deep-links
  // straight to the routed session view) — mas não quando ele PEDIU o lado do
  // aluno, senão o redirect desfaz a escolha na hora.
  useEffect(() => {
    if (asLearner) return;
    if (session && identity.userId && session.instructorId === identity.userId) {
      navigate(`/live/instructor/${session.id}`, { replace: true });
    }
  }, [session, identity.userId, navigate, asLearner]);

  // Durable attendance row (first join wins) — best-effort, never blocks the UI.
  useEffect(() => {
    if (session?.id && identity.userId && status === 'live') {
      void recordClassAttendance(session.id);
    }
  }, [session?.id, identity.userId, status]);

  const sound = useLiveSound();
  useAnswerOutbox();

  // Play the advance cue when the professor moves the class to a NEW activity
  // (not on first mount / leaving reception).
  const prevActivityRef = useRef<string | null>(null);
  const { onAdvance } = sound;
  useEffect(() => {
    const prev = prevActivityRef.current;
    if (currentActivityId && prev && prev !== currentActivityId) onAdvance();
    prevActivityRef.current = currentActivityId;
  }, [currentActivityId, onAdvance]);

  // Per-activity local answer state (result writes stay per-user) + the moment
  // the current activity opened for THIS learner (the elapsed-time origin). Both
  // reset whenever the professor force-advances to a different activity.
  const [answered, setAnswered] = useState<{ id: string; correct: boolean; elapsedMs: number } | null>(
    null
  );
  const [activityStartedAt, setActivityStartedAt] = useState<number | null>(null);
  // Hidden-time tally on top of that origin — see src/utils/activityDuration.ts
  // for what `elapsedMs` vs `visibleMs` mean. Read once, when the answer settles.
  const duration = useActivityDuration(activityStartedAt);
  const [saving, setSaving] = useState(false);
  // The activity id whose countdown expired (locks that activity for the learner).
  // Keyed on the id — NOT a bare boolean — so an advance right after a timeout
  // never paints the NEXT activity as locked for a frame while an effect catches up.
  const [timeUpFor, setTimeUpFor] = useState<string | null>(null);
  // Raised hand (presence-tracked). Auto-lowers whenever the class advances.
  // O estado mora no hook, junto da presença que ele publica — uma cópia local
  // aqui dessincronizaria assim que o professor abaixasse a mão pelo menu dele.
  const toggleHand = useCallback(() => {
    setHandRaised(!handRaised);
  }, [handRaised, setHandRaised]);
  useEffect(() => {
    // Restore the learner's own persisted answer (refresh protection) — a page
    // reload must NOT re-open an answered activity nor re-fire its broadcast.
    const stored =
      sessionId && currentActivityId ? readStoredAnswer(sessionId, currentActivityId) : null;
    setAnswered(stored && currentActivityId ? { id: currentActivityId, ...stored } : null);
    setSaving(false);
    setTimeUpFor(null);
    setHandRaised(false);
    setActivityStartedAt(currentActivityId ? Date.now() : null);
  }, [sessionId, currentActivityId, setHandRaised]);

  // Tell the room (via presence) whether this learner already has local work for
  // the current activity, so the professor's stage picker can show "em andamento"
  // BEFORE pulling — instead of only "concluiu / nada". Event-driven off the code
  // snack's autosave (no polling); setWorkingOn no-ops unless the value changes,
  // so at most one presence re-track per activity.
  useEffect(() => {
    if (!sessionId || !currentActivityId) {
      setWorkingOn(null);
      return;
    }
    const sync = () => {
      const { status } = gatherStageContent(sessionId, currentActivityId);
      setWorkingOn(status === 'not_started' ? null : currentActivityId);
    };
    sync();
    window.addEventListener(CODE_SNAPSHOT_EVENT, sync);
    return () => window.removeEventListener(CODE_SNAPSHOT_EVENT, sync);
  }, [sessionId, currentActivityId, setWorkingOn]);

  const { onTimeUp } = sound;
  const handleTimeUp = useCallback(() => {
    // Already answered THIS activity → no "time's up" sound (only the lock).
    if (answered?.id !== currentActivityId) onTimeUp();
    setTimeUpFor(currentActivityId);
  }, [onTimeUp, currentActivityId, answered]);

  // Professor stopped the timer → end the round for everyone. "Pens down": the
  // gate below locks every answerable kind on expiry/stop, `code` INCLUDED
  // (Tainan 2026-07-23 "se acabar o clock deve disable tudo mesmo").
  useEffect(() => {
    if (stoppedFor && current && stoppedFor === current.id) setTimeUpFor(current.id);
  }, [stoppedFor, current]);

  // Professor restarted the clock → a fresh timer for THIS activity, still
  // running, must lift the expiry lock so the learner can work again.
  useEffect(() => {
    if (timer && current && timer.activityId === current.id && timer.deadline > Date.now()) {
      setTimeUpFor((prev) => (prev === current.id ? null : prev));
    }
  }, [timer, current]);

  // Reading a slide is not an exercise: no clock, no "pens down". The guard is
  // load-bearing on `concept_reveal`, where the professor's "Revelar resposta"
  // stops the (non-existent) timer through the SAME channel a real expiry uses —
  // so the class was told "tempo limite esgotado" on a slide nobody was timing.
  const isExercise = isExerciseActivity(current);
  const timerRunning = Boolean(timer && current && timer.activityId === current.id);
  const expired = isExercise && timeUpFor !== null && timeUpFor === current?.id;
  const hasAnswered = answered?.id === current?.id;
  // The clock running out (or the professor stopping it) takes the activity away
  // from any learner who hasn't answered — UNIVERSALLY, every answerable kind
  // including `code`. Whether a correct answer can be shown on screen is a
  // SEPARATE concern (`hasRevealableAnswer` gates only the instructor's Reveal
  // button, e.g. `code` has nothing to reveal) and deliberately does NOT gate the
  // lock. See `learnerActivityGate`.
  const gate = learnerActivityGate({
    timerRunning,
    expired,
    answered: hasAnswered,
  });
  const { started, locked } = gate;

  async function handleComplete(correct: boolean, detail?: ActivityCompleteDetail) {
    if (!current || saving || !gate.canComplete) return;
    // Force-advance model: answering does NOT move the student forward — only the
    // professor's pointer advances. We persist a correct result, and broadcast
    // EVERY answer (right or wrong) + how long the learner took, so the professor
    // sees who responded and their time.
    // ONE clock for all three consumers (the podium broadcast, the durable
    // class_answers row, and the learner's own attempt log). `activityStartedAt`
    // was already the origin here; `useActivityDuration` only adds the
    // hidden-time tally on top of it, so the broadcast number is unchanged and
    // the DB gets the same instant plus how much of it was actually on screen.
    const sample = duration.read();
    // O instante da RESPOSTA, capturado aqui e carregado até a escrita. Este é o
    // momento em que o aluno settlou; a escrita pode acontecer bem depois, se a
    // rede cair e o `writeOrQueue` enfileirar. Ele ancora o trace de eventos
    // (itera.activity_traces) — sem isso, uma resposta dada às 14h05 numa aula
    // com wifi ruim ficaria datada de quando a conexão voltou.
    const settledAt = Date.now();
    const elapsedMs = sample?.elapsedMs ?? 0;
    setAnswered({ id: current.id, correct, elapsedMs });
    if (sessionId)
      storeAnswer(sessionId, current.id, {
        correct,
        elapsedMs,
        response: stageResponseText(current.kind, detail?.response),
      });
    sound.onAnswer(correct);
    // Record the attempt whether or not it was right (E2E finding D2). Before
    // this, a wrong answer in a live class survived only as an ephemeral
    // broadcast and a `class_answers` row scoped to that one session — nothing
    // reached the learner's own durable record, so the per-learner attempt log
    // held wins exclusively. Only a PASS blocks on the write (`saving` gates the
    // UI); a miss is fired best-effort so the learner is never stuck waiting on
    // a write for an answer that is already settled and already broadcast.
    //
    // ADR-6 carves the guest out of ALL of it: a guest never writes
    // itera.progress / activity_results / XP, pass or miss. RLS would NOT stop
    // this (their itera.users id satisfies `progress_rw_self`), so the rule lives
    // here — a demo must not leave progress rows behind on a real cohort's
    // content. The durable class_answers/class_attendance copies below DO happen:
    // that is what the professor's post-class report reads.
    //
    // Toda escrita passa pelo `writeOrQueue`: numa queda de rede ela entra na
    // fila durável e é retentada quando a conexão volta, em vez de morrer num
    // catch silencioso. Wifi de escola caindo 30s deixou de custar a resposta.
    const response = detail?.response ?? null;
    // A sequência do que o aluno fez, quando a família dele já emite
    // (`src/utils/activityFamilies.ts`). Ao vivo ela viaja pelo mesmo
    // `writeOrQueue` das outras: numa queda de rede vai pra fila junto com a
    // resposta, e é rebaseada no instante em que ele respondeu, não no
    // reconectar.
    const actions = detail?.actions ? [...detail.actions] : undefined;
    // O ENUNCIADO que este aluno leu, do jeito que ele leu (migration 0037 —
    // Fase 0 do plano 20260803-itera-replay-de-sessao-de-atividade). Sai daqui,
    // da tela que acabou de renderizar a atividade, e viaja junto pela fila:
    // `itera.activities.spec` é mutável (trigger `activity_defs_sync_instances`)
    // e o dreno da fila pode acontecer horas depois, então buscá-lo na escrita
    // traria a redação de então — que é exatamente a divergência que o snapshot
    // existe pra impedir.
    const specSnapshot = buildSpecSnapshot(current.spec, locale) ?? undefined;
    // E O QUE ela exercitava (migration 0038 — Fase 1 do plano
    // 20260803-itera-learning-control-plane-prototipo). Mesma regra do snapshot,
    // com um motivo a mais: a tag pedagógica não só pode mudar, ela é FEITA pra
    // mudar (ADR-5 — a gramática compete contra os dados), então nem a fila nem
    // a análise podem ir buscá-la depois.
    const pedagogicalContext = buildPedagogicalContext(current);
    if (guest) {
      // no durable per-learner progress for a link-invited guest
    } else if (correct) {
      setSaving(true);
      await writeOrQueue({
        kind: 'progress',
        activityId: current.id,
        passed: true,
        response,
        duration: sample,
        settledAt,
        actions,
        specSnapshot,
        pedagogicalContext,
      });
      setSaving(false);
    } else {
      void writeOrQueue({
        kind: 'progress',
        activityId: current.id,
        passed: false,
        response,
        duration: sample,
        settledAt,
        actions,
        specSnapshot,
        pedagogicalContext,
      });
    }
    broadcastAnswer(current.id, correct, elapsedMs);
    // Durable copy (right AND wrong) for the post-class report.
    if (sessionId) {
      void writeOrQueue({
        kind: 'classAnswer',
        sessionId,
        activityId: current.id,
        correct,
        elapsedMs,
      });
    }
  }

  const activityIdx = currentActivityId ? activities.findIndex((a) => a.id === currentActivityId) : -1;
  const progressPct = activities.length
    ? Math.round(((activityIdx >= 0 ? activityIdx + 1 : 0) / activities.length) * 100)
    : 0;

  const ended = status === 'ended';
  const podiumRanking = useMemo(
    () => rankByScore(roster, elapsed, answers, stars),
    [roster, elapsed, answers, stars]
  );
  const roomRows = useMemo(
    () =>
      buildLiveRoomRows({
        ranking: podiumRanking,
        answerers: peerAnswerers,
        roster,
        currentActivityId,
        selfUserId: identity.userId ?? undefined,
      }),
    [podiumRanking, peerAnswerers, roster, currentActivityId, identity.userId]
  );

  // Restart the personal stopwatch whenever a timer round starts, so the
  // podium's elapsed time reflects the timed round rather than time spent
  // idling on the activity before the professor armed it.
  useEffect(() => {
    if (started && !answered) setActivityStartedAt(Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // Pre-class name+avatar step: shown once when the learner has no real name yet
  // (Itera override). Skipped while the profile query is still resolving so a
  // real name never flashes the gate.
  const { data: profile, isLoading: profileLoading } = useProfile();
  const [gatePassed, setGatePassed] = useState(false);
  const gateNeeded =
    // A guest already picked their name+avatar at the door — that step is what
    // minted their session (GuestLiveRoute), so re-gating here would ask twice.
    !guest &&
    Boolean(session) &&
    !ended &&
    !gatePassed &&
    !profileLoading &&
    isGenericName(profile?.displayName, profile?.email);

  // Where the surface EXITS. The X and the podium CTA both point at `/` for a
  // member; for a guest that route is RequireAuth+RequireSubscription, so it
  // would finish the demo on a login wall. `guest.leave()` swaps the whole tree
  // for the guest end-card (owned by GuestLiveRoute, so the channel is torn down
  // with the page) — a guest can never reach an authenticated route from here.
  const leave = useCallback(() => {
    if (guest) {
      guest.leave();
      return;
    }
    navigate('/');
  }, [guest, navigate]);

  // Sair no meio da aula pergunta antes: o X fica a um toque do avatar e do
  // indicador AO VIVO, e um clique errado tirava o aluno da turma sem volta
  // óbvia. Com a aula encerrada o X é só "voltar" — aí não pergunta nada.
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  // The sandbox owns a fixed viewport-relative height, so its surface is pinned
  // to the viewport with the scroll living INSIDE the stage — never the page.
  const onSandbox = current?.kind === 'sandbox_scenario';

  // Global fixed feedback footer (Duolingo pattern), shared with the async
  // player. In LIVE mode the learner does NOT self-advance (the instructor
  // force-advances the cohort), so the footer shows the green/red signal + the
  // "wait for the next one" hint instead of a CTA. Driven off the durable
  // `answered` state (so it survives a reload), gated to the footer-graded kinds
  // — now including `sandbox_scenario` (Tainan 2026-07-18): the sandbox's
  // terminal verdict rides the same wait-mode footer as the MCQ family, its
  // in-window reveal recap/outcome panel stays, and the below-stage hint moves
  // into the footer.
  const footerGraded = isFooterGradedKind(current?.kind) || (!!current && isByocActivity(current));
  const answeredHere = Boolean(current && answered?.id === current.id);
  const footerResult: FooterResult | null =
    footerGraded && answeredHere && answered ? { correct: answered.correct } : null;
  const answeredWaitHint = answered ? (
    <span
      className="inline-flex items-center gap-2 justify-end flex-wrap"
      data-testid="live-answered-hint"
      data-correct={answered.correct ? 'true' : 'false'}
    >
      <LiveWaitingIndicator correct={answered.correct} />
      <span className={answered.correct ? 'text-menta' : 'text-clay'}>
        {answered.correct ? t('live.done.waitForNext') : t('live.wrong.waitForNext')}{' '}
        <span className="text-muted-foreground" data-testid="live-answered-elapsed">
          · {t('live.elapsed.you', { time: formatDuration(answered.elapsedMs / 1000) })}
        </span>
      </span>
    </span>
  ) : undefined;

  if (removed) return <LiveRemovedScreen onLeave={leave} />;

  return (
    <div className={`bg-background flex flex-col ${onSandbox ? 'h-[100dvh] overflow-hidden' : 'min-h-screen'}`}>
      <LiveReconnectBanner show={reconnecting} />
      {/* Immersive chrome — shared verbatim with the instructor surface. */}
      <LiveSessionChrome
        progressPct={progressPct}
        connected={connected}
        presenceCount={roster.length}
        ended={ended}
        activityIndex={activityIdx}
        activityCount={activities.length}
        timerSlot={
          timerRunning && timer && current ? (
            <LiveTimer prominent deadline={timer.deadline} onExpire={handleTimeUp} onWarn={sound.onWarn} />
          ) : isExercise && !answered && !locked && activityStartedAt ? (
            // Sem contagem regressiva o mesmo lugar mostra o cronômetro pessoal:
            // solto no meio da coluna ele lia como parte da atividade. Só em
            // exercício — num slide o relógio cobra pressa de quem só lê.
            <LiveStopwatch startedAt={activityStartedAt} />
          ) : undefined
        }
        handSlot={
          // Abaixo de `lg` a sidebar cai embaixo da coluna inteira, atrás do
          // rodapé fixo — a mão precisa viver no topo, junto do timer.
          <span className="lg:hidden">
            <LiveHandButton raised={handRaised} onToggle={toggleHand} />
          </span>
        }
        onClose={() => (ended ? leave() : setConfirmingLeave((open) => !open))}
        closeConfirm={
          confirmingLeave && !ended ? (
            <LiveLeaveConfirm onConfirm={leave} onCancel={() => setConfirmingLeave(false)} />
          ) : undefined
        }
      />

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <main
          className={`flex-1 min-h-0 px-4 md:px-8 ${
            onSandbox
              ? `overflow-y-auto pb-6 ${stagedAnswer && !ended ? 'pt-14' : 'pt-6'}`
              : 'lg:overflow-y-auto pt-14 md:pt-20'
          } ${footerResult ? 'pb-40' : onSandbox ? '' : 'pb-8'}`}
        >
          {/* Focused column — width follows the ACTIVITY KIND via the SHARED
              rule, so a `code` snack gets the wide column in the LIVE class too
              (it used to widen only in the solo player). `sandbox_scenario`
              keeps its roomier live-only cap through the override map. */}
          {/* Dentro do <main>: fora dele o palco escorregava por baixo do chrome
              (o X caía em cima do avatar) e, por ser irmão da linha flex, cortava
              a sidebar sticky ao meio. */}
          {stagedAnswer && !ended && (
            <div className="-mx-4 md:-mx-8 mb-6">
              <LiveStage
                staged={stagedAnswer}
                cursor={stageCursor}
                cursorIntervalMs={stageCursorPlan.intervalMs}
                cursorOff={!stageCursorPlan.enabled}
              />
            </div>
          )}

          <div
            data-testid="live-main"
            className={`w-full mx-auto ${columnMaxWidthClass(current?.kind, LIVE_COLUMN_OVERRIDES)}`}
          >
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p>{t('live.connecting')}</p>
          </div>
        ) : !session ? (
          <div className="rounded-3xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground" data-testid="live-not-found">
            {t('live.notFound')}
          </div>
        ) : ended ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-3xl border border-border bg-card p-8 md:p-10 max-w-xl mx-auto"
            data-testid="live-ended"
          >
            <LivePodium ranking={podiumRanking} selfUserId={identity.userId ?? undefined} />
            <button
              onClick={leave}
              data-testid="live-ended-cta"
              className="mt-8 w-full h-12 px-6 rounded-full bg-evergreen text-obsidiana font-medium hover:bg-evergreen-hi transition-colors"
            >
              {guest ? t('live.guest.ended.cta') : t('live.ended.cta')}
            </button>
          </motion.div>
        ) : gateNeeded ? (
          <LiveNameGate
            initialName={isGenericName(profile?.displayName, profile?.email) ? '' : profile?.displayName ?? ''}
            initialAvatarUrl={profile?.avatarUrl}
            onDone={() => setGatePassed(true)}
          />
        ) : (
          <>
            {current ? null : !currentActivityId ? (
              // No pointer — the class is in RECEPTION until the instructor begins.
              // The durable read completed under `loading`, so a null pointer here
              // is real (not a not-yet-loaded flicker) — show the reception, never
              // an activity skeleton (which would wrongly signal "an activity is
              // coming").
              <LiveReception roster={roster} />
            ) : lessonPending ? (
              // Pointer set and the lesson content is still resolving (late-join /
              // reconnect) — activity SKELETON so a joiner with a live pointer goes
              // straight to the activity once it lands. (loop-1 fix #3.)
              <div className="mt-7">
                <ActivitySkeleton />
              </div>
            ) : !lessonLoaded || activities.length === 0 ? (
              // The lesson read SETTLED with no readable content — the class was
              // started on content this learner can't access (e.g. another tenant's
              // program, RLS-blocked). Show a clear message instead of an endless
              // skeleton (which reads as a black screen).
              <div
                className="mt-8 rounded-3xl border border-dashed border-clay/40 bg-clay/5 p-12 text-center"
                data-testid="live-unavailable"
              >
                <p className="font-display text-lg text-foreground">{t('live.unavailable.title')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('live.unavailable.subtitle')}</p>
              </div>
            ) : (
              // Lesson loaded with activities, pointer set, but this activity isn't
              // in the list yet (transient pointer/lesson mismatch) — brief skeleton.
              <div className="mt-7">
                <ActivitySkeleton />
              </div>
            )}
            {current && (
              <LiveActivityStage
                activity={{
                  ...current,
                  status: answered?.id === current.id && answered.correct ? 'done' : current.status,
                }}
                readOnly={gate.readOnly}
                reveal={timeUpFor !== null && timeUpFor === current.id}
                onComplete={handleComplete}
                onSubmit={sound.onSubmit}
                footer={
                  <>
                    {/* "Pens down" when the clock runs out — same locked hint for
                        every answerable kind, `code` included. */}
                    {locked && (
                      <p className="mt-5 text-center text-sm text-destructive" data-testid="live-locked-hint">
                        {t('live.timer.lockedHint')}
                      </p>
                    )}
                    {/* For GRADED (MCQ) kinds the answered hint moves into the
                        global fixed FeedbackFooter below. Non-graded kinds (the
                        sandbox) keep it inline here so their below-stage hint
                        isn't lost. */}
                    {!footerGraded && answered?.id === current.id && (
                      <div
                        className={`mt-5 flex flex-wrap items-center justify-center gap-2 text-sm ${answered.correct ? 'text-menta' : 'text-clay'}`}
                        data-testid="live-answered-hint"
                        data-correct={answered.correct ? 'true' : 'false'}
                      >
                        <LiveWaitingIndicator correct={answered.correct} />
                        <span>
                          {answered.correct ? t('live.done.waitForNext') : t('live.wrong.waitForNext')}{' '}
                          <span className="text-muted-foreground" data-testid="live-answered-elapsed">
                            · {t('live.elapsed.you', { time: formatDuration(answered.elapsedMs / 1000) })}
                          </span>
                        </span>
                      </div>
                    )}
                  </>
                }
              />
            )}
          </>
        )}
          </div>
        </main>

        {!loading && session && !ended && (
          <LiveSidebar
            role="learner"
            roster={roster}
            answerers={peerAnswerers}
            rows={roomRows}
            hasActivity={!!current}
            handSlot={<LiveHandButton full raised={handRaised} onToggle={toggleHand} />}
          />
        )}
      </div>

      {!loading && session && <LiveSoundDock raised={!ended && Boolean(footerResult)} />}

      {/* ── Global fixed answer-feedback footer (Duolingo pattern) ──
          Live/force-advance mode: green/red + the "wait for the next one" hint
          (no self-advance CTA — the instructor advances the cohort). */}
      {!ended && <FeedbackFooter result={footerResult} waitHint={answeredWaitHint} />}
    </div>
  );
}
