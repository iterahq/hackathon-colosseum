import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ActivityI18nBridge } from '@/components/branded/activity/IteraActivityHost';
import { readTextDraft, saveTextDraft } from '@/services/textDraft.service';
import { rememberStorageScope } from '@/utils/storageScope';
import type { Activity } from '@/types/content';
import { ActivityTestHarness } from './ActivityTestHarness';

const reflection: Activity = {
  id: 'act-1',
  lessonId: 'l',
  ordinal: 1,
  kind: 'document',
  spec: { prompt: 'What did you learn?' },
  rubric: { min_words: 3 },
};

const box = () => screen.getByTestId('document-reflection-input') as HTMLTextAreaElement;

function renderHarness() {
  return render(
    <I18nProvider>
      <ActivityI18nBridge>
        <ActivityTestHarness activity={reflection} />
      </ActivityI18nBridge>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  rememberStorageScope('author');
});

describe('ActivityTestHarness — an author trying a reflection', () => {
  it('gets an empty box back on reset, and nothing of the run is kept', () => {
    renderHarness();
    fireEvent.change(box(), { target: { value: 'a test run of mine' } });
    fireEvent.click(screen.getByTestId('activity-done'));
    expect(screen.getByTestId('test-verdict')).toBeTruthy();

    fireEvent.click(screen.getByTestId('test-reset'));
    expect(box().value).toBe('');
    expect(readTextDraft('act-1')).toBeNull();
  });

  it('does not open on what the same person was writing as a learner', () => {
    saveTextDraft('act-1', 'my own half-written answer');
    renderHarness();
    expect(box().value).toBe('');
    expect(readTextDraft('act-1')).toBe('my own half-written answer');
  });
});
