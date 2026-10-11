import type { PassportPageData } from '@/types/achievements';
import type { Capabilities } from '@/types/learnerProfile';
import type { ProgressStory } from '@/types/progressStory';

/** Pure join of the passport pages and the wallet's capability graph into the numbers the header and the dashboard lead with. */
export function progressStory(facts: { pages: readonly Pick<PassportPageData, 'daysDone' | 'totalDays'>[]; pending: boolean; wallet: string | null; capabilities: Pick<Capabilities, 'verifiedCount' | 'total'> | null }): ProgressStory {
  return {
    daysDone: facts.pages.reduce((n, p) => n + p.daysDone, 0),
    daysTotal: facts.pages.reduce((n, p) => n + p.totalDays, 0),
    verified: facts.capabilities ? facts.capabilities.verifiedCount : null,
    capabilitiesTotal: facts.capabilities ? facts.capabilities.total : null,
    wallet: facts.wallet,
    pending: facts.pending,
  };
}
