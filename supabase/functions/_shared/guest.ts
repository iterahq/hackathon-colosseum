/** Lessons a visitor without an account may have graded: the first day of the first trail. */
export const GUEST_LESSON_IDS: ReadonlySet<string> = new Set(['0e7d6618-f9ba-46ba-bf28-71cf86f32716']);

/** Answers one address may have graded per hour without a session. Nothing is written for them. */
export const GUEST_RATE = { limit: 300, windowMs: 60 * 60_000 } as const;
