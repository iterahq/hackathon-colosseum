import { describe, expect, it } from 'vitest';
import { isNetworkError, isUnreachable } from './networkFailure';

const query = (over: Partial<Parameters<typeof isUnreachable>[0]> = {}) => ({
  isPending: true,
  fetchStatus: 'fetching' as const,
  failureCount: 0,
  failureReason: null,
  ...over,
});

describe('isNetworkError', () => {
  it.each(['TypeError: Failed to fetch', 'TypeError: Load failed', 'NetworkError when attempting to fetch resource.', 'Network request failed'])(
    'knows "%s"',
    (message) => expect(isNetworkError(new Error(message))).toBe(true),
  );

  it('leaves server answers and non-errors alone', () => {
    expect(isNetworkError(new Error('permission denied for view my_subscription'))).toBe(false);
    expect(isNetworkError(new Error('JWT expired'))).toBe(false);
    expect(isNetworkError('Failed to fetch')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe('isUnreachable', () => {
  it('is true when the browser is offline and the fetch is paused', () => {
    expect(isUnreachable(query({ fetchStatus: 'paused' }))).toBe(true);
  });

  it('is true once the first attempt failed on the network', () => {
    expect(isUnreachable(query({ failureCount: 1, failureReason: new Error('TypeError: Failed to fetch') }))).toBe(true);
  });

  it('is false while the first attempt is in flight', () => {
    expect(isUnreachable(query())).toBe(false);
  });

  it('keeps waiting through the retries of any other error', () => {
    expect(isUnreachable(query({ failureCount: 2, failureReason: new Error('permission denied') }))).toBe(false);
  });

  it('is false once the query has an answer', () => {
    expect(isUnreachable(query({ isPending: false, fetchStatus: 'paused', failureCount: 3, failureReason: new Error('Failed to fetch') }))).toBe(false);
  });
});
