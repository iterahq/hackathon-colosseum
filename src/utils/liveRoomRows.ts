/**
 * Flattens everything the sidebar knows about one live class into ONE ordered
 * list of rows — the single "sala ao vivo" list that replaced the old
 * roster + who-answered + ranking stack.
 *
 * Order is the CUMULATIVE podium order (`rankByScore`), not the current
 * activity's: the standings are what the class is playing for, and they already
 * re-shuffle as answers land — which is what makes the list feel alive. The
 * current activity contributes the per-row STATE, never the sorting.
 *
 * Padrão do projeto: pure function, no React.
 */
import type {
  ClassAnswerer,
  ClassPresenceMember,
  ClassRanking,
  LiveRoomRow,
} from '@/types/liveClass';

export interface LiveRoomRowsInput {
  ranking: ClassRanking;
  answerers: ClassAnswerer[];
  roster: ClassPresenceMember[];
  currentActivityId?: string | null;
  selfUserId?: string;
  disconnectedUserIds?: string[];
  /** Durable guest list (itera.class_guests), merged over the presence flag. */
  guestUserIds?: string[];
}

export function buildLiveRoomRows({
  ranking,
  answerers,
  roster,
  currentActivityId,
  selfUserId,
  disconnectedUserIds,
  guestUserIds,
}: LiveRoomRowsInput): LiveRoomRow[] {
  const answerById = new Map(answerers.map((a) => [a.userId, a]));
  const presenceById = new Map(roster.map((m) => [m.userId, m]));
  const down = new Set(disconnectedUserIds ?? []);
  const guests = new Set(guestUserIds ?? []);

  const rowFor = (
    entry: { userId: string; name: string; avatarUrl: string | null; isGuest?: boolean },
    extra: { rank?: number; correctCount: number; answeredCount: number },
  ): LiveRoomRow => {
    const answer = answerById.get(entry.userId);
    const presence = presenceById.get(entry.userId);
    return {
      userId: entry.userId,
      name: entry.name,
      avatarUrl: entry.avatarUrl,
      rank: extra.rank,
      state: answer?.state ?? 'pending',
      working:
        answer?.state !== 'done' &&
        answer?.state !== 'wrong' &&
        Boolean(currentActivityId) &&
        presence?.workingOn === currentActivityId,
      elapsedMs: answer?.elapsedMs,
      raised: presence?.handRaised === true,
      down: down.has(entry.userId),
      guest: entry.isGuest === true || guests.has(entry.userId),
      isSelf: Boolean(selfUserId) && entry.userId === selfUserId,
      correctCount: extra.correctCount,
      answeredCount: extra.answeredCount,
    };
  };

  return [
    ...ranking.ranked.map((r) =>
      rowFor(r, { rank: r.rank, correctCount: r.correctCount, answeredCount: r.answeredCount }),
    ),
    ...ranking.waiting.map((w) => rowFor(w, { correctCount: 0, answeredCount: 0 })),
  ];
}
