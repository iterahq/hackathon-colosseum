import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n';
import { ActivityI18nBridge } from '@/components/branded/activity/IteraActivityHost';
import { LiveStage } from '@/components/live/LiveStage';
import { saveTextDraft } from '@/services/textDraft.service';
import { rememberStorageScope } from '@/utils/storageScope';
import type { Activity } from '@/types/content';
import type { StagedAnswer } from '@/types/liveClass';

const reflection: Activity = {
  id: 'act-1',
  lessonId: 'l',
  ordinal: 1,
  kind: 'document',
  spec: { prompt: 'What did you learn?' },
  rubric: { min_words: 3 },
};

const staged: StagedAnswer = {
  activityId: 'act-1',
  kind: 'document',
  content: null,
  status: 'in_progress',
  author: { userId: 'ana', name: 'Ana', avatarUrl: null },
} as unknown as StagedAnswer;

beforeEach(() => {
  localStorage.clear();
  rememberStorageScope('viewer');
});

describe('LiveStage — a reflection on stage', () => {
  it('does not show the viewer’s own half-written text under the staged learner’s name', () => {
    saveTextDraft('act-1', 'what the VIEWER was writing');
    render(
      <I18nProvider>
        <ActivityI18nBridge>
          <LiveStage staged={staged} activity={reflection} />
        </ActivityI18nBridge>
      </I18nProvider>,
    );
    expect(screen.getByTestId('live-stage-identity').textContent).toContain('Ana');
    expect((screen.getByTestId('document-reflection-input') as HTMLTextAreaElement).value).toBe('');
  });
});
