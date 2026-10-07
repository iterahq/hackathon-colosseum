import { useEffect } from 'react';
import { pageName } from '@/lib/pageTitle';

/** Names the page after its own data (a program, a lesson) while it is mounted. An empty name names nothing. */
export function usePageTitle(name: string | null | undefined): void {
  const own = name?.trim() || null;
  useEffect(() => {
    if (own === null) return;
    pageName.set(own);
    return () => {
      if (pageName.get() === own) pageName.set(null);
    };
  }, [own]);
}
