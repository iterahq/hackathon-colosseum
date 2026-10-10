import { localParts, type I18nText } from './awards.ts';

export const PODIUM_KEYS = ['podium_1', 'podium_2', 'podium_3'] as const;
export type PodiumKey = (typeof PODIUM_KEYS)[number];
export type PodiumPosition = 1 | 2 | 3;

export function isPodiumKey(key: string): key is PodiumKey {
  return (PODIUM_KEYS as readonly string[]).includes(key);
}

export function podiumKey(position: PodiumPosition): PodiumKey {
  return PODIUM_KEYS[position - 1];
}

export function podiumPositionOf(key: string): PodiumPosition | null {
  const index = (PODIUM_KEYS as readonly string[]).indexOf(key);
  return index < 0 ? null : ((index + 1) as PodiumPosition);
}

export interface PodiumData {
  attendance: Array<{ user_id: string }>;
  answers: Array<{ user_id: string; correct: boolean; elapsed_ms: number | null }>;
  /** The name the report shows for each participant (display name, else e-mail, else the id's start). */
  names: Record<string, string>;
  /** Link visitors without an account: listed in the report, never awarded. */
  guestIds: readonly string[];
  /** People who run the class (its instructor): never awarded. */
  excludedIds?: readonly string[];
}

export interface RankedParticipant {
  userId: string;
  name: string;
  correct: number;
  answered: number;
  totalMs: number;
  isGuest: boolean;
}

/**
 * The instructor report's ranking (`src/utils/buildClassReport.ts`): most
 * correct first, then most answered, then fastest, then name. Guests are ranked
 * alongside the cohort, exactly as the report lists them.
 */
export function rankParticipants(data: PodiumData): RankedParticipant[] {
  const guests = new Set(data.guestIds);
  const byUser = new Map<string, RankedParticipant>();
  const ensure = (userId: string): RankedParticipant => {
    let participant = byUser.get(userId);
    if (!participant) {
      participant = { userId, name: data.names[userId] ?? userId.slice(0, 8), correct: 0, answered: 0, totalMs: 0, isGuest: guests.has(userId) };
      byUser.set(userId, participant);
    }
    return participant;
  };
  for (const row of data.attendance) ensure(row.user_id);
  for (const answer of data.answers) {
    const participant = ensure(answer.user_id);
    participant.answered += 1;
    if (answer.correct) participant.correct += 1;
    participant.totalMs += answer.elapsed_ms ?? 0;
  }
  return [...byUser.values()].sort(
    (x, y) => y.correct - x.correct || y.answered - x.answered || x.totalMs - y.totalMs || x.name.localeCompare(y.name),
  );
}

export interface PodiumPlace {
  position: PodiumPosition;
  userId: string;
  correct: number;
  answered: number;
  totalMs: number;
}

/**
 * The three medals of a session: the first three of the report's ranking that
 * are learners. A guest or the instructor is skipped and the next learner takes
 * the place; someone who answered nothing takes none.
 */
export function podiumOf(data: PodiumData): PodiumPlace[] {
  const excluded = new Set(data.excludedIds ?? []);
  return rankParticipants(data)
    .filter((participant) => !participant.isGuest && !excluded.has(participant.userId) && participant.answered > 0)
    .slice(0, 3)
    .map((participant, index) => ({
      position: (index + 1) as PodiumPosition,
      userId: participant.userId,
      correct: participant.correct,
      answered: participant.answered,
      totalMs: participant.totalMs,
    }));
}

/** What a podium medal row remembers: the class and the place. No person is named in it. */
export function podiumState(place: PodiumPlace, session: { title: I18nText; endedAt: string }, timeZone: string): Record<string, unknown> {
  return {
    position: place.position,
    class_title: session.title,
    class_date: localParts(session.endedAt, timeZone).date,
    correct: place.correct,
    answered: place.answered,
    time_zone: timeZone,
  };
}
