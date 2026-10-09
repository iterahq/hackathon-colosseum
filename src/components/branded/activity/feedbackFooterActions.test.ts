import { describe, it, expect } from 'vitest';
import { feedbackFooterActions } from '@/components/branded/activity/feedbackFooterActions';

describe('feedbackFooterActions', () => {
  it('leads with retry after a miss, keeping continue beside it', () => {
    expect(feedbackFooterActions({ correct: false, canContinue: true, canRetry: true })).toEqual({
      primary: 'retry',
      secondary: 'continue',
    });
  });

  it('never offers retry after a correct answer', () => {
    expect(feedbackFooterActions({ correct: true, canContinue: true, canRetry: true })).toEqual({
      primary: 'continue',
      secondary: null,
    });
  });

  it('keeps the lone continue on a miss when no retry is on offer', () => {
    expect(feedbackFooterActions({ correct: false, canContinue: true, canRetry: false })).toEqual({
      primary: 'continue',
      secondary: null,
    });
  });

  it('shows nothing in the live wait mode', () => {
    expect(feedbackFooterActions({ correct: false, canContinue: false, canRetry: true })).toEqual({
      primary: null,
      secondary: null,
    });
  });
});
