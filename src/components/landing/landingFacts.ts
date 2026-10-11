import type { TeamMember } from '@/types/landing';

/**
 * What the landing may state about the product and the people. Only facts from the README and the owner's
 * pitch notes; a value only the owner can supply stays `null` and its slot stays hidden until it exists.
 */

/** The 2-minute pitch video. OWNER MUST SUPPLY: the public URL once recorded. */
export const PITCH_VIDEO_URL: string | null = null;

/** The public "verify it yourself" page (LANE A). Hidden until it is live on main. */
export const VERIFY_PATH = '/verify';
export const VERIFY_PAGE_LIVE = false;

/** The community behind Itera; the link answers on the public internet. */
export const DEVFELLOWSHIP_URL = 'https://devfellowship.com';

export const TEAM: readonly TeamMember[] = [
  { name: 'Samuel Stefano', roleKey: 'landing.team.samuel.role', bioKey: 'landing.team.samuel.bio' },
  { name: 'Tainan Fidelis', roleKey: 'landing.team.tainan.role', bioKey: 'landing.team.tainan.bio' },
];
