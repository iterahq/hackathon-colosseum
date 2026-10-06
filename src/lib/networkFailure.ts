import type { UseQueryResult } from '@tanstack/react-query';

const NETWORK_ERROR = /failed to fetch|load failed|networkerror|network request failed|network connection was lost|internet connection appears to be offline/i;

export function isNetworkError(error: unknown): boolean {
  return error instanceof Error && NETWORK_ERROR.test(error.message);
}

/**
 * A first read that cannot reach the server: the browser is offline (React Query
 * pauses the fetch) or the first attempt died on the network. React Query keeps
 * such a query `pending` through its retries, so a page waiting only on
 * `isPending` shows a shimmer for several seconds before the error. Other
 * errors are not an answer to this and keep the retry behaviour as it was.
 */
export function isUnreachable(
  query: Pick<UseQueryResult, 'isPending' | 'fetchStatus' | 'failureCount' | 'failureReason'>,
): boolean {
  if (!query.isPending) return false;
  return query.fetchStatus === 'paused' || (query.failureCount > 0 && isNetworkError(query.failureReason));
}
