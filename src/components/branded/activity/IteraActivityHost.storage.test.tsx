import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DocumentActivity, useActivityStorage, type PortableActivity } from '@iterahq/activities';
import { codeDraftKey } from '@iterahq/activities/code';
import { ActivityI18nBridge, ITERA_ACTIVITY_STORAGE, WithoutTextDrafts } from './IteraActivityHost';
import { I18nProvider } from '@/i18n';
import { readCodeSnapshot } from '@/services/codeSnapshot.service';
import { readTextDraft, saveTextDraft } from '@/services/textDraft.service';
import { rememberStorageScope } from '@/utils/storageScope';

const reflection = {
  id: 'act-1',
  kind: 'document',
  status: 'todo',
  spec: { prompt: 'What did you learn?' },
  rubric: { min_words: 3 },
} as unknown as PortableActivity;

function renderReflection() {
  return render(
    <I18nProvider>
      <ActivityI18nBridge>
        <DocumentActivity activity={reflection} onComplete={vi.fn()} />
      </ActivityI18nBridge>
    </I18nProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  rememberStorageScope('learner-a');
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('ITERA_ACTIVITY_STORAGE — the text a learner is writing has its own slot', () => {
  it('lands in the learner-scoped text draft, not in the code draft of the activity', () => {
    ITERA_ACTIVITY_STORAGE.write(codeDraftKey('act-1'), 'const a = 1');
    renderReflection();
    fireEvent.change(screen.getByTestId('document-reflection-input'), { target: { value: 'half a thought' } });
    act(() => void vi.advanceTimersByTime(600));

    expect(readTextDraft('act-1')).toBe('half a thought');
    expect(readCodeSnapshot('act-1')?.code).toBe('const a = 1');
  });

  it('is back in the box on the next open, for that learner only', () => {
    const first = renderReflection();
    fireEvent.change(screen.getByTestId('document-reflection-input'), { target: { value: 'half a thought' } });
    act(() => void vi.advanceTimersByTime(600));
    first.unmount();

    const second = renderReflection();
    expect((screen.getByTestId('document-reflection-input') as HTMLTextAreaElement).value).toBe('half a thought');
    second.unmount();

    rememberStorageScope('learner-b');
    renderReflection();
    expect((screen.getByTestId('document-reflection-input') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('WithoutTextDrafts — a screen that only shows the activity', () => {
  function renderShown() {
    return render(
      <I18nProvider>
        <ActivityI18nBridge>
          <WithoutTextDrafts>
            <DocumentActivity activity={reflection} onComplete={vi.fn()} />
          </WithoutTextDrafts>
        </ActivityI18nBridge>
      </I18nProvider>,
    );
  }

  it('does not put the viewer’s own draft in the box', () => {
    saveTextDraft('act-1', 'what the VIEWER was writing');
    renderShown();
    expect((screen.getByTestId('document-reflection-input') as HTMLTextAreaElement).value).toBe('');
  });

  it('does not keep what is typed there, nor touch the viewer’s draft', () => {
    saveTextDraft('act-1', 'what the VIEWER was writing');
    renderShown();
    fireEvent.change(screen.getByTestId('document-reflection-input'), { target: { value: 'a demonstration' } });
    act(() => {
      vi.advanceTimersByTime(600);
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(readTextDraft('act-1')).toBe('what the VIEWER was writing');
  });

  it('still lets the other drafts through', () => {
    function WritesCode() {
      const storage = useActivityStorage();
      storage.write(codeDraftKey('act-1'), 'const a = 1');
      return null;
    }
    render(
      <I18nProvider>
        <ActivityI18nBridge>
          <WithoutTextDrafts>
            <WritesCode />
          </WithoutTextDrafts>
        </ActivityI18nBridge>
      </I18nProvider>,
    );
    expect(readCodeSnapshot('act-1')?.code).toBe('const a = 1');
  });
});

describe('ITERA_ACTIVITY_STORAGE — the package preferences stay out of the draft slots', () => {
  it('keeps an itera.activities.* key as a plain browser value and fires no snapshot event', () => {
    const onSnapshot = vi.fn();
    window.addEventListener('itera:code-snapshot-saved', onSnapshot);
    ITERA_ACTIVITY_STORAGE.write('itera.activities.mediaHoverPreview', 'on');
    expect(localStorage.getItem('itera.activities.mediaHoverPreview')).toBe('on');
    expect(ITERA_ACTIVITY_STORAGE.read('itera.activities.mediaHoverPreview')).toBe('on');
    expect(onSnapshot).not.toHaveBeenCalled();
    ITERA_ACTIVITY_STORAGE.clear('itera.activities.mediaHoverPreview');
    expect(localStorage.getItem('itera.activities.mediaHoverPreview')).toBeNull();
    window.removeEventListener('itera:code-snapshot-saved', onSnapshot);
  });
});
